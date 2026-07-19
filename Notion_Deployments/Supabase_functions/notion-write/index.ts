// LifeOS：Notion 整合 Phase 2 — Edge Function（寫入）
// 部署方式：supabase functions deploy notion-write
// 用途：前端登入後呼叫這支 function 來新增／編輯／封存 Notion 資料庫裡的項目。
// 跟 notion-fetch 一樣：驗證呼叫者身份、用呼叫者自己存的 Token 代打 Notion API，
// 前端只傳單純的值（字串/布林/數字/陣列），欄位型別轉換的細節都在這裡處理，
// 前端不需要知道 Notion API 每種屬性型別實際的 JSON 格式長怎樣。
//
// 請求格式：
//   { action: "create", properties: { [欄位名]: 值, ... } }
//   { action: "update", pageId: "...", properties: { [欄位名]: 值, ... } }
//   { action: "archive", pageId: "..." }
//
// 回傳格式統一為 200 + JSON，用 success / error 欄位表示狀態。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NOTION_VERSION = "2022-06-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 把前端傳來的單純值，依照這個欄位在 Notion 的實際型別，轉成 Notion API 要求的 JSON 結構
function buildNotionProperty(type: string, value: unknown): Record<string, unknown> | null {
  switch (type) {
    case "title":
      return { title: [{ text: { content: String(value ?? "") } }] };
    case "rich_text":
      return { rich_text: value ? [{ text: { content: String(value) } }] : [] };
    case "date":
      return { date: value ? { start: String(value) } : null };
    case "checkbox":
      return { checkbox: !!value };
    case "select":
      return { select: value ? { name: String(value) } : null };
    case "status":
      return { status: value ? { name: String(value) } : null };
    case "multi_select":
      return { multi_select: Array.isArray(value) ? value.map((name) => ({ name: String(name) })) : [] };
    case "number":
      return { number: value === "" || value === null || value === undefined ? null : Number(value) };
    case "url":
      return { url: value ? String(value) : null };
    case "email":
      return { email: value ? String(value) : null };
    case "phone_number":
      return { phone_number: value ? String(value) : null };
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "缺少登入憑證" }, 200);
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ success: false, error: "請求格式錯誤" }, 200);
    }

    const { action, pageId, properties } = body || {};
    if (!action || !["create", "update", "archive"].includes(action)) {
      return json({ success: false, error: "不支援的操作" }, 200);
    }
    if ((action === "update" || action === "archive") && !pageId) {
      return json({ success: false, error: "缺少項目 ID" }, 200);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ success: false, error: "登入驗證失敗，請重新登入" }, 200);
    }
    const userId = userData.user.id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connError } = await adminClient
      .from("notion_connections")
      .select("notion_token, notion_database_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError || !connection) {
      return json({ success: false, error: "尚未連接 Notion" }, 200);
    }

    // 封存不需要知道欄位型別，直接處理
    if (action === "archive") {
      const archiveRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${connection.notion_token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ archived: true }),
      });

      if (!archiveRes.ok) {
        const errText = await archiveRes.text();
        console.log("Notion 封存失敗", archiveRes.status, errText);
        return json({ success: false, error: "封存失敗，請稍後再試一次" });
      }

      return json({ success: true });
    }

    // create／update 都需要先知道資料庫的欄位型別，才能把前端傳來的單純值轉成正確格式
    const schemaRes = await fetch(
      `https://api.notion.com/v1/databases/${connection.notion_database_id}`,
      {
        headers: {
          "Authorization": `Bearer ${connection.notion_token}`,
          "Notion-Version": NOTION_VERSION,
        },
      }
    );

    if (!schemaRes.ok) {
      const errText = await schemaRes.text();
      console.log("讀取資料庫結構失敗", schemaRes.status, errText);
      return json({ success: false, error: "讀取資料庫結構失敗，請確認連線設定" });
    }

    const schemaData = await schemaRes.json();
    const schemaProperties = schemaData.properties as Record<string, any>;

    const notionProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties || {})) {
      const propDef = schemaProperties[key];
      if (!propDef) continue;
      const built = buildNotionProperty(propDef.type, value);
      if (built) notionProperties[key] = built;
    }

    if (action === "create") {
      const createRes = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${connection.notion_token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: connection.notion_database_id },
          properties: notionProperties,
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.log("Notion 新增失敗", createRes.status, errText);
        return json({ success: false, error: "新增失敗，請確認欄位內容是否符合 Notion 資料庫的設定" });
      }

      return json({ success: true });
    }

    // action === "update"
    const updateRes = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${connection.notion_token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ properties: notionProperties }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.log("Notion 更新失敗", updateRes.status, errText);
      return json({ success: false, error: "更新失敗，請確認欄位內容是否符合 Notion 資料庫的設定" });
    }

    return json({ success: true });
  } catch (error) {
    console.log("notion-write 未預期錯誤", error);
    return json({ success: false, error: "伺服器發生未預期的錯誤" }, 200);
  }
});
