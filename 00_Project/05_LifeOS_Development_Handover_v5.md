# LifeOS Development Handover v5

---
## 本文件回答：
* Handover 描述的是目前狀態，若與 Development Log 發生差異。
* 以最新 Handover 為主，並將新的重大決策補進下一篇 Development Log。

* Question：Where We Are Now
* Purpose：提供目前專案狀態與下一步工作。
* Update Frequency：每次交接前更新。
---

## 給下一位接手的 Claude

開始前請依序完整閱讀：
1. AI Collaboration Charter
2. LifeOS Manifesto
3. LifeOS Current Project Context
4. LifeOS Development Log（倒序排列，最新的在最上面，請務必讀到 **Log #009**）
5. Development Handover（本文件）

五份文件都讀完再開始動手。本次交接距離上一版 Handover（v4）隔了兩次重要的開發階段（Log #008、#009），內容變動不小：**五分頁導覽架構已經正式上線、正式版與朋友測試版已合併為單一版本、Notion 整合 Phase 1＋2 已經實作完成並上線**。

## 0. Current Status（30 秒快速閱讀）

LifeOS Status：**Feature Expansion**（延續 Log #006 開始的階段，沒有變動）

Current Phase：
✅ MVP 完成
✅ Supabase 雲端同步完成
✅ 四大核心功能雲端化完成
✅ Google OAuth 登入完成
✅ 五分頁導覽架構上線（Log #008），正式版與朋友測試版已合併為單一版本
✅ 登入/登出區塊視覺定案（Log #008）：桌面固定右上角、手機回歸正常文件流置頂靠右，登入用 🔐 圖示，登出用單一「Exit」文字按鈕
✅ Notion 整合 Phase 1（讀取）＋ Phase 2（新增/編輯/封存）完成並上線（Log #009）

Current Focus：
**讓女友實際測試 Notion 筆記分頁**（連接她自己的 Notion、讀取／新增／編輯／封存），收集她的真實使用回饋，這是目前最重要的待驗證項目。

Current Biggest Open Question：
沒有阻塞專案前進的技術問題。「打造屬於 LifeOS 原生的筆記系統」的念頭列入 Parking Lot #006，方向還沒定案（使用者自己也還沒想清楚），**不要主動催促或幫忙規劃**，等使用者自己想清楚方向再回頭討論。

## 1. 專案現況總覽

- **已上線網址**：`https://haotian030.github.io/LifeOS/`（正式版與朋友測試版已合併，不再維護兩份檔案，見 Log #008 決策三十）
- **雲端服務**：Supabase（Project URL: `https://jtnmrikpgixlqxnudxob.supabase.co`）
- **登入功能**：雙軌並存，Google OAuth 為主力，Email OTP 半失效狀態（沿用 v4 現況，無變動，詳見 v4 或 Log #005）
- **資料現況**：Todo／Goal／Reflection／User Stats 四大核心功能皆從 localStorage 換成 Supabase（沿用 v3/v4，無變動）
- **五分頁導覽架構**：桌面常駐側邊欄（浮動面板樣式，非貼邊）／手機底部固定分頁列，同一套 code 靠 CSS media query（768px）切換。五個分頁：待辦與目標／反思／個人狀態／財務／Notion 筆記
- **登入/登出**：桌面 `position: fixed` 固定右上角；手機回歸正常文件流置頂靠右（重要：手機版**不能**用 `fixed`，會在捲動時遮住底下的按鈕，這是實際踩過的坑，詳見 Log #008）
- **Notion 整合**：BYO Token 模式，每位使用者各自建立 Notion Internal Integration、把 Token／資料庫 ID 貼進 LifeOS，互不干擾。範圍限定在「資料庫」這個 Notion 內容型態，不含一般頁面/圖片/巢狀區塊/行事曆檢視

## 2. Notion 整合技術架構（Log #009 新增，first-time 需要理解的部分）

### 2.1 為什麼需要 Edge Function

瀏覽器沒辦法直接呼叫 Notion API（CORS 限制），加上 Token 不能外洩到前端程式碼裡，因此新增了 Supabase Edge Function 作為代理層。**這是 LifeOS 第一次真正需要伺服器端邏輯**，跟過去純前端 + Supabase 資料庫直接讀寫的架構不同，之後如果要擴充 Notion 相關功能，都要記得這個限制依然存在。

### 2.2 兩支 Edge Function

- **`notion-fetch`**：驗證呼叫者身份（用呼叫者自己的 JWT，不信任前端傳來的任何 user_id）、用 service role 讀出該使用者自己存的 Token／資料庫 ID、代打 Notion API 查詢資料庫，同時回傳資料庫結構（`schema`：欄位型別、select/status/multi_select 的可選項目與官方顏色）供前端動態產生表格欄位與編輯控制項。回傳格式統一 200 + `{connected, schema?, entries?, error?}`，不依賴 HTTP status code。
- **`notion-write`**：處理 `create`／`update`／`archive` 三種動作，前端只傳單純值（字串/布林/數字/陣列），型別轉換的細節（Notion API 每種屬性型別實際的 JSON 結構）都在這支 function 裡處理，前端不需要知道。

兩支 function 都用**部署方式：Supabase 後台「Deploy a new function → Via Editor」直接貼程式碼部署，沒有用 CLI**（使用者不熟悉命令列工具，Dashboard 部署完全夠用，詳見 Log #009 決策三十七）。

### 2.3 `notion_connections` 資料表

每位使用者一筆（`user_id` 當主鍵），存 `notion_token`／`notion_database_id`，RLS 限制只有本人能讀寫自己那一筆。SQL migration 檔案已經跑過，不用重複執行。

### 2.4 重要限制，之後被問到可以直接參照

- **只能封存，不能永久刪除**：Notion API 沒有提供真正刪除的能力，`archived: true` 效果等同 Notion 自己的垃圾桶機制，這是 Notion API 本身的限制，不是 LifeOS 選擇做成這樣
- **範圍只有資料庫**：一般頁面內容（打勾清單區塊、圖片、巢狀子頁面、行事曆檢視）完全沒有處理，這是不同的資料結構，若之後要做，是一個規模不小的新功能，不是現有基礎上加幾行程式碼

### 2.5 前端互動邏輯（Phase 2，就地編輯）

- **不是跳出視窗表單**，是「點哪一格改哪一格」的就地編輯，這是根據使用者實測回饋從 Modal 表單改過來的（詳見 Log #009 決策三十八），跟 Notion 本身的操作習慣一致
- 多選標籤（multi_select）是「先勾選多個，按確認或點格子外面才一次送出」，不是點一個就立刻存檔（詳見 Log #009 決策三十九，同樣是實測後修正）
- 新增項目：直接建立一筆空白資料，並自動把標題欄位帶入編輯狀態，模仿 Notion「+New page」的行為

## 3. 五分頁導覽架構與登入區塊（Log #008，視覺已收斂）

- 桌面側邊欄是**浮動面板**（四邊留白、圓角、陰影），**不是貼邊滿版**——這是經過兩輪來回實測才確認的結論：貼邊本身（不論邊框樣式如何調整）就是造成「壓抑感」的根本原因，浮動才是有效解法。之後如果有人建議「改成貼邊比較乾淨」，可以直接參照這個已經驗證過的結論，不用重新踩一次坑
- 登入/登出**桌面固定右上角、手機回歸正常文件流置頂**，手機版絕對不能用 `fixed`，會在捲動時遮住底下內容
- 登入用單一 🔐 圖示，登出用單一「Exit」文字按鈕，完整 email 用 hover tooltip 呈現，不直接顯示

## 4. 四個核心功能現況（沿用 v3/v4，本次無技術變動）

與 v4 描述完全相同，未變動，詳見 v4 原文或 Log #003/#004。

## 5. Supabase 資料庫現況

4 張舊表（`todos`／`goals`／`reflections`／`user_stats`）與 RLS policy，沿用 v3/v4，未變動。新增 `notion_connections` 表（見本文件第 2.3 節）。

## 6. Parking Lot 現況

- **#001** 財務／健康改真實資料來源——未觸發
- **#002** 本週目標週期可調整——未觸發
- **#003** 自架伺服器——未觸發
- **#004** Notion 整合 Phase 2——**已於 Log #009 完成，此項目正式關閉**
- **#005** 使用者自訂排版／自訂首頁——未觸發
- **#006（Log #009 新增）** 打造屬於 LifeOS 原生的筆記系統——未觸發，方向是「自己設計」而非「把 Notion 頁面內容搬過來」，使用者自己也還沒想清楚要什麼，**不要主動催促或規劃，等使用者自己想清楚再回頭討論**

## 7. 下一步建議（依優先順序）

1. **讓女友實際測試 Notion 筆記分頁**，包括她自己建立 Internal Integration、貼 Token 這個操作門檻是否順暢，以及讀取/新增/編輯/封存的實際使用回饋——這是目前最重要的待驗證項目
2. 持續觀察五分頁架構、登入區塊視覺在長時間使用後是否還有需要調整的地方
3. 「打造屬於自己筆記系統」的方向，等使用者自己想清楚之後再啟動討論，不主動催促
4. Resend 網域購買、財務/健康真實資料、自架伺服器，都持續延後，無明確需求前不處理

## Current Biggest Blocker

沒有真正卡住專案前進的技術阻塞點。目前是等待真實使用回饋（女友測試 Notion 筆記）的階段，不是技術問題。
