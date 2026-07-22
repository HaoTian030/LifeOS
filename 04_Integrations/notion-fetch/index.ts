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

// 依照 Notion 官方的顏色名稱回傳原始 color 字串（gray/brown/orange/yellow/green/blue/purple/pink/red/default），
// 實際要對應成什麼 CSS 顏色，交給前端的 style.css 處理，這裡只負責如實轉傳 Notion 回來的資料。

function extractPropertyField(prop: any): Record<string, unknown> {
  switch (prop.type) {
    case "rich_text":
      return { type: "text", value: prop.rich_text.map((t: any) => t.plain_text).join("") };
    case "date":
      return { type: "text", value: prop.date ? prop.date.start : "" };
    case "checkbox":
      return { type: "text", value: prop.checkbox ? "✅" : "⬜" };
    case "select":
      return prop.select
        ? { type: "tag", value: prop.select.name, color: prop.select.color }
        : { type: "text", value: "" };
    case "status":
      return prop.status
        ? { type: "tag", value: prop.status.name, color: prop.status.color }
        : { type: "text", value: "" };
    case "multi_select":
      return {
        type: "tags",
        values: (prop.multi_select || []).map((s: any) => ({ name: s.name, color: s.color })),
      };
    case "number":
      return { type: "text", value: prop.number !== null && prop.number !== undefined ? String(prop.number) : "" };
    case "url":
      return { type: "text", value: prop.url || "" };
    case "email":
      return { type: "text", value: prop.email || "" };
    case "phone_number":
      return { type: "text", value: prop.phone_number || "" };
    default:
      return { type: "text", value: "" };
  }
}

function extractTitleText(prop: any): string {
  if (!prop || prop.type !== "title") return "（無標題）";
  return prop.title.map((t: any) => t.plain_text).join("") || "（無標題）";
}

// 給編輯表單「預先填入目前的值」用，格式是單純的原始值（字串/布林/數字/陣列），
// 不是給畫面顯示用的（顯示用的是上面的 extractPropertyField）。
function extractRawValue(prop: any): unknown {
  switch (prop.type) {
    case "rich_text":
      return prop.rich_text.map((t: any) => t.plain_text).join("");
    case "date":
      return prop.date ? prop.date.start : "";
    case "checkbox":
      return !!prop.checkbox;
    case "select":
      return prop.select ? prop.select.name : "";
    case "status":
      return prop.status ? prop.status.name : "";
    case "multi_select":
      return (prop.multi_select || []).map((s: any) => s.name);
    case "number":
      return prop.number ?? null;
    case "url":
      return prop.url || "";
    case "email":
      return prop.email || "";
    case "phone_number":
      return prop.phone_number || "";
    default:
      return null;
  }
}

// 把資料庫的欄位結構（型別、select/status/multi_select 的可選項目）整理成前端能拿來
// 動態產生新增/編輯表單的格式，不用讓前端自己再去猜每個欄位是什麼型態。
function buildSchemaFields(schemaProperties: Record<string, any>, fieldOrder: string[]) {
  return fieldOrder.map((key) => {
    const propDef = schemaProperties[key];
    const field: Record<string, unknown> = { key, type: propDef.type };
    if (propDef.type === "select") {
      field.options = (propDef.select.options || []).map((o: any) => ({ name: o.name, color: o.color }));
    }
    if (propDef.type === "status") {
      field.options = (propDef.status.options || []).map((o: any) => ({ name: o.name, color: o.color }));
    }
    if (propDef.type === "multi_select") {
      field.options = (propDef.multi_select.options || []).map((o: any) => ({ name: o.name, color: o.color }));
    }
    return field;
  });
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

    // 先拿資料庫結構，才知道哪一欄是標題、欄位原本的排列順序長怎樣
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
      console.log("Notion 資料庫結構讀取錯誤", schemaRes.status, errText);
      return json({
        connected: true,
        error: "讀取 Notion 資料庫結構失敗，請確認 Token 與資料庫 ID 是否正確，並確認資料庫已經分享給你的 Integration",
      });
    }

    const schemaData = await schemaRes.json();
    const schemaProperties = schemaData.properties as Record<string, any>;
    const titleKey = Object.entries(schemaProperties).find(
      ([, prop]: [string, any]) => prop.type === "title"
    )?.[0];
    const fieldOrder = Object.keys(schemaProperties).filter((key) => key !== titleKey);

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
      const title = titleKey ? extractTitleText(page.properties[titleKey]) : "（無標題）";
      const fields = fieldOrder
        .map((key) => ({ key, ...extractPropertyField(page.properties[key]) }))
        .filter((field) => (field.type === "tags" ? (field as any).values.length > 0 : field.value !== ""));
      const raw: Record<string, unknown> = {};
      fieldOrder.forEach((key) => {
        raw[key] = extractRawValue(page.properties[key]);
      });
      return { id: page.id, url: page.url, title, fields, raw };
    });

    const schema = {
      titleKey: titleKey || null,
      fields: buildSchemaFields(schemaProperties, fieldOrder),
    };

    return json({ connected: true, schema, entries });
  } catch (error) {
    console.log("notion-fetch 未預期錯誤", error);
    return json({ connected: false, error: "伺服器發生未預期的錯誤" }, 200);
  }
});
