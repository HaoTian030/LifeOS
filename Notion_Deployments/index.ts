// LifeOS：Notion 整合 Phase 1 — Edge Function
// 部署方式：supabase functions deploy notion-fetch
// 用途：前端登入後呼叫這支 function，它會：
//   1. 驗證呼叫者是誰（用呼叫者自己的 JWT，不是猜測或信任前端傳來的 user_id）
//   2. 用 service role 讀出這位使用者自己存的 Notion Token／資料庫 ID（前端本身沒有權限直接讀 token 欄位以外的用途）
//   3. 代替前端呼叫 Notion API（瀏覽器直接呼叫會被 CORS 擋下來），回傳整理過的資料
//
// 回傳格式統一為 200 + JSON，用 connected / error 欄位表示狀態，不依賴 HTTP status code，
// 前端判斷邏輯比較單純，不用處理 supabase-js 對非 2xx 回應的複雜錯誤物件。

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

function extractPropertyValue(prop: any): string {
  switch (prop.type) {
    case "title":
      return prop.title.map((t: any) => t.plain_text).join("");
    case "rich_text":
      return prop.rich_text.map((t: any) => t.plain_text).join("");
    case "date":
      return prop.date ? prop.date.start : "";
    case "checkbox":
      return prop.checkbox ? "✅" : "⬜";
    case "select":
      return prop.select ? prop.select.name : "";
    case "multi_select":
      return prop.multi_select.map((s: any) => s.name).join("、");
    case "number":
      return prop.number !== null && prop.number !== undefined ? String(prop.number) : "";
    case "url":
      return prop.url || "";
    case "email":
      return prop.email || "";
    case "phone_number":
      return prop.phone_number || "";
    case "status":
      return prop.status ? prop.status.name : "";
    default:
      return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ connected: false, error: "缺少登入憑證" }, 200);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 用呼叫者自己的 JWT 驗證身份，不能信任前端傳來的任何 user_id 參數
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ connected: false, error: "登入驗證失敗，請重新登入" }, 200);
    }
    const userId = userData.user.id;

    // 用 service role 讀取這位使用者自己的 Notion 連線設定
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: connection, error: connError } = await adminClient
      .from("notion_connections")
      .select("notion_token, notion_database_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (connError) {
      console.log("讀取 notion_connections 發生錯誤", connError);
      return json({ connected: false, error: "讀取連線設定時發生錯誤" }, 200);
    }

    if (!connection) {
      return json({ connected: false });
    }

    const notionRes = await fetch(
      `https://api.notion.com/v1/databases/${connection.notion_database_id}/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${connection.notion_token}`,
          "Notion-Version": NOTION_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page_size: 20,
          sorts: [{ timestamp: "created_time", direction: "descending" }],
        }),
      }
    );

    if (!notionRes.ok) {
      const errText = await notionRes.text();
      console.log("Notion API 回傳錯誤", notionRes.status, errText);
      return json({
        connected: true,
        error: "讀取 Notion 失敗，請確認 Token 與資料庫 ID 是否正確，並確認資料庫已經分享給你的 Integration",
      });
    }

    const notionData = await notionRes.json();
    const entries = (notionData.results || []).map((page: any) => {
      const properties: Record<string, string> = {};
      for (const [key, prop] of Object.entries(page.properties as Record<string, any>)) {
        properties[key] = extractPropertyValue(prop);
      }
      return { id: page.id, url: page.url, properties };
    });

    return json({ connected: true, entries });
  } catch (error) {
    console.log("notion-fetch 未預期錯誤", error);
    return json({ connected: false, error: "伺服器發生未預期的錯誤" }, 200);
  }
});
