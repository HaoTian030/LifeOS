# LifeOS Development Handover v9

---
## 本文件回答：
* Handover 描述的是目前狀態，若與 Development Log 發生差異，以最新 Handover 為主，並將新的重大決策補進下一篇 Development Log。
* Question：Where We Are Now
* Purpose：提供目前專案狀態與下一步工作。
* Update Frequency：每次交接前更新。
---

## 給下一位接手的 Claude

開始前請依序完整閱讀：
1. AI Collaboration Charter
2. LifeOS Manifesto
3. LifeOS Current Project Context
4. LifeOS Development Log（倒序排列，最新的在最上面，請讀到 **Log #013**，本文件等於是 #013 之後、還沒正式寫進 Log 的所有內容）
5. DD-001 LifeOS Finance Architecture
6. Development Handover（本文件，v9）

**這次交接的規模跟以往不一樣**：v8 → v9 這一輪，是財務模組 Phase 3（預算 vs 實際、現金流拆分、週期性提醒）從無到有的完整開發過程，橫跨非常多次來回調整。**本文件內容量很大，因為它同時承擔了「這輪的 Handover」跟「還沒寫進 Log 的決策記錄」兩個角色**——使用者這次沒有提供實際的 Development Log 檔案，只給了程式碼，所以這輪的決策目前只存在於這份文件跟對話紀錄裡，**強烈建議下一位接手者找機會把「二、這輪的重大決策」那節整理成正式的 Log #014，補進使用者自己保管的 Development Log 檔案**，本文件不能取代那個動作。

---

## 一、Current Status（30 秒快速閱讀）

LifeOS Status：**Feature Expansion**（延續 Log #006 開始的階段）

Current Phase：
✅ MVP 完成
✅ Supabase 雲端同步完成
✅ 財務模組 Phase 1（資產總覽）／Phase 2（記帳）完成並通過真實使用驗證（見 Log #013 之前）
🆕 ✅ **財務模組 Phase 3 完整開發完成**：預算分配（累積儲蓄型／每月固定型）、可運用資金計算、下次扣款日提醒＋自動推算、智慧預填連動記帳、主畫面/管理彈窗版面大幅重新設計

Current Focus：
1. 這輪的決策需要整理進正式的 Development Log（見上方提醒）
2. 財務模組本身功能上已經跑得很順，接下來如果使用者沒有新的財務需求，可以考慮回頭看**反思**（想加 AI 回饋，還沒開始）或**個人狀態**（雛形階段，尚未開發）
3. Notion 筆記維持關閉保留觸發（Parking Lot #006，跟這輪無關，沒有變動）

Current Biggest Open Question：
沒有阻塞的技術問題。財務 Phase 3 的核心邏輯已經穩定，這輪後段幾乎都是版面/互動細節的反覆修正，使用者最後一次回饋時功能面已經確認沒問題。**下一步完全取決於使用者想不想繼續深入財務模組的細節，還是要轉去別的分頁。**

---

## 二、這輪的重大決策（建議整理成 Log #014）

### 決策脈絡：Phase 3 從「三個目標」出發

Handover v8 訂下的 Phase 3 範圍是「預算 vs 實際比較、現金流拆分、週期性提醒」三個目標。這輪對話從這裡出發，但**實際落地過程中，資料模型的定義被使用者的真實記帳邏輯反覆修正了很多次**，最終形狀跟一開始設計的不一樣，過程本身很有參考價值，記錄如下。

### 2.1 資料模型：`finance_budget_items`（新表，DD-001 Intentions 層落地）

```sql
create table finance_budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  account_id uuid references finance_accounts(id) not null,
  tag text,
  label text not null,
  planned_amount numeric not null check (planned_amount > 0),
  cycle text not null check (cycle in ('monthly', 'once')) default 'monthly',
  active boolean not null default true,
  sort_order integer default 0,
  accumulated_amount numeric not null default 0,
  next_due_date date,
  frequency text check (frequency in ('monthly', 'quarterly', 'semiannual', 'annual')),
  monthly_deposit_amount numeric,
  created_at timestamptz default now()
);
```

`finance_transactions` 新增 `budget_item_id`（可為空，外鍵），交易可以直接關聯到分配項目，**不用 tag 文字比對**——同一個帳戶常有多個同類型但用途不同的分配（例如兩張保單都想歸類「保費」），文字比對分不清楚該算給哪一筆。

`finance_accounts` 新增 `count_in_available`（boolean，預設 true）：使用者自己決定這個帳戶的錢算不算進「本月可運用資金池」，不用系統猜測帳戶類型（`account_type` 是自由輸入文字，猜不準）。

六份 SQL migration 依序執行（都在 `/mnt/user-data/outputs/`，檔名 `phase3_migration.sql` 到 `phase3_migration_6_monthly_deposit_amount.sql`），**使用者這輪對話中已經全部部署完成**。

### 2.2 兩種週期型態的本質差異（這是整輪最核心、也是反覆修正最多次的概念）

- **每月固定（monthly）**：房租、保費這種每個月都要繳的錢。`getBudgetItemPaidAmount` 只算「這個月」關聯的交易金額（依 `occurred_on` 篩選），跨月自動歸零重算。**這個型態純粹是追蹤/提醒用途，完全不影響可運用資金計算**——這是修正過的結論，原本設計成「還沒付的部分要預扣」，但使用者的真實習慣是薪資入帳當月就繳清，預扣反而讓可運用金額顯得比實際緊，所以拿掉了。

- **累積儲蓄（once）**：紅包、年繳保費這種要存好幾個月才夠的錢。**進度不是從交易記錄算的，是獨立的 `accumulated_amount` 欄位**，透過主畫面的「💰」按鈕手動存入/取出（取出用負數）。這個型態的錢**已經存入的部分**會從可運用資金扣掉（因為已經被劃定用途），**還沒存到的目標金額不扣**（那只是未來計畫，不是現在的負債）。

  **為什麼累積儲蓄型不能用交易記錄算進度**：使用者的實際情境是「錢還留在原帳戶裡，只是心裡劃定用途」（例如紅包基金），不是真的把錢轉走。如果照每月固定型那樣用交易記錄，會讓帳戶顯示餘額跟銀行 App 對不起來，違反 Phase 2 已經驗證過的核心前提。

### 2.3 可運用資金計算的最終版本

```
帳戶可運用金額 = 帳戶實際餘額 － 這個帳戶「累積儲蓄型」已存入的金額總和
（每月固定型完全不影響這個計算）

本月結存 = 所有「計入可運用資金池」的資產帳戶可運用金額加總
可運用資金（主畫面顯示的數字）= 本月結存本身，不再額外扣減任何東西
```

「下月固定支出提醒」是**完全獨立、不參與任何計算**的提醒清單，依帳戶分組列出小計（每月固定型用 `planned_amount`，累積儲蓄型只有設定過 `monthly_deposit_amount` 的才算入，沒設定代表存入節奏不固定、不該被當成「下個月固定要轉的錢」），清單最下面有總計行。這個提醒清單經過三次調整才定案：一開始有扣減計算 → 使用者發現不合理 → 拿掉扣減只留顯示 → 使用者再回饋「沒有累積儲蓄型還是看不出參考價值」→ 改成現在依帳戶分組的版本。

### 2.4 下次扣款日提醒＋自動推算

`next_due_date` + `frequency` 兩個欄位搭配：過期後徽章變成可點擊的按鈕（紅色實心＋通知波紋動畫，不是整體透明度閃爍——第一版用透明度閃爍會讓文字在最淡的時候完全看不清楚，這是要避開的坑），點擊後確認「這筆真的扣了嗎」，確認後**同時**做完「歸零累積進度」＋「依頻率往後推算下次扣款日」兩件事。

**推算基準是「原本排定的扣款日」，不是「使用者確認的當天」**——這是使用者拿實際案例驗證過的決策：银行偶爾晚一兩天扣款（例如排定15號、實際16號才扣），如果用「確認當天」去推算下一次，日期會跟著飄移；用「原本排定的日期」去推算，不管使用者哪天才處理，下次日期永遠準確對齊。

### 2.5 智慧預填（規則式，不是 AI）

記帳表單依交易類型連動不同週期的分配項目：
- 支出 → 比對「每月固定」型（金額 ±5% 內才猜）
- 收入／轉帳 → 比對「累積儲蓄」型（金額每次不同，改成「該帳戶只有一個進行中項目才建議」，多個候選就不猜、交給手動選單）

**有一個真實的死角修正過**：原本設計是「猜不出來就整個藏起來」，但手動選單的唯一入口是「改選其他項目」按鈕，猜不出來時這個按鈕根本不會出現，等於整個功能打不開。修正成「猜不到也一定要能連到手動選單」。

Parking Lot **#011（新增）AI 語意自動分類**：規則式預填如果之後準確度不夠，可以考慮接 AI 判斷，但這是完全獨立的後續討論，這輪只做規則式。

### 2.6 UI 架構的演進（這部分改了非常多次，記錄最終版本）

- **🎯 按鈕**：從「分配總覽」正名為「管理資金分配資料庫」，角色收斂成**只做結構管理**（新增/編輯/刪除/歸零），不顯示進度條——進度/存入這類「呈現結果」全部移到主畫面。
- **🎯 彈窗本身變成兩層**：
  - 第一層：精簡的帳戶清單（帳戶名稱＋項目數量＋目標總額一行），這是這輪最後定案的版面，中間經過「兩欄動態平衡」「手風琴收合」等好幾個方案比較才收斂到這個
  - 第二層：點帳戶列開啟的獨立管理彈窗，裡面才是完整的項目清單（拖曳排序＋編輯＋刪除＋歸零）
- **主畫面帳戶卡片**：點帳戶名稱（`.finance-item-info-expandable`）開啟**帳戶詳情彈窗**（跟其他彈窗同一套置中彈窗結構），裡面顯示該帳戶的分配項目進度＋💰存入按鈕。這個機制本身也演進了三次：一開始是「往下推開卡片」（會撐高同一列造成空白）→ 改成「浮動彈出貼在卡片下方」（受限於卡片位置，項目多還是要捲動）→ 最終改成「正式置中彈窗」（跟記帳明細/管理資金分配資料庫同一套結構，空間最充裕）。
- **💰 存入按鈕**：最終版本是「一鍵存入」——有設定 `monthly_deposit_amount` 就直接存入那個金額，不跳出視窗；沒設定才問金額。**取出/扣款**（例如過年把紅包領出來用）是點旁邊的**狀態文字本身**（有虛線底線提示），手動輸入金額，輸入負數就是取出。中間有一版做了「存入／其他金額」兩個按鈕＋展開收合機制，使用者反映排版很亂、點外部不會自動收合，最後簡化成現在這個版本。
- **管理帳戶模式（🔧）**：把手（⠿）常駐、編輯/刪除收在「⋯」後面，點了才展開。這個展開機制也修過一次 bug——原本用「往下推開整張卡片」會在 CSS Grid 版面下把同一列其他卡片擠出空白，改成「浮動彈出、直接蓋在把手+⋯本身上面」，不影響卡片高度。
- **可運用資金摘要卡片**：從「收合標籤點開才看」→「固定顯示」→ 桌面版改成左右並排（左邊可運用資金主數字、右邊下月固定支出提醒清單），手機版維持上下堆疊。
- **新增帳戶**、**分配項目**、**快捷設定**三個表單都統一改成「分組卡片」風格（基本資料／金額與週期／扣款提醒 三個小標籤分區塊），輸入框改成白底（跟記帳表單一致），拿掉「資產類型」欄位（資料庫欄位保留不刪，只是表單跟顯示不再用它）。
- **側邊欄**：新增收合功能，**預設收合**、不記憶狀態（重新整理一律回到收合，使用者刻意要求不用系統幫忙記住）。

### 2.7 這輪抓到並修正的幾個真正的 bug（不是新功能，是修正既有問題）

1. `.finance-item` 從 flex 改成 block（修帳戶卡片排版）時，忘記記帳明細列表也共用這個 class，導致明細項目排版跑掉——已補上獨立的 `.finance-item-row` 包裝結構。
2. `buildFinanceAccountItem` 重構時，`info.appendChild(nameRow)` 跟 `info.appendChild(meta)` 兩行意外整個遺漏，導致主畫面所有帳戶卡片顯示空白——已修正，這是這輪影響最嚴重的一次操作失誤。
3. `openFinanceBudgetAccountModal` 呼叫 `refreshFinanceBudgetAccountModal` 的順序寫反，導致「只有開著才刷新」的防呆檢查在彈窗還沒設成顯示前就先跑，內容從來沒被填進去——已修正順序。
4. 管理帳戶模式的編輯/刪除浮動選單，有一行舊的 `item.appendChild(editActions)` 忘記刪除，把選單從正確的巢狀位置搬出來，導致定位跑掉——已移除該行。
5. CSS 裡有一個命名錯字：`.finance-item { margin-bottom: 12px; }` 少打了 "budget"，實際上一直在覆蓋帳戶卡片的 margin-bottom，已修正成 `.finance-budget-item`。

**這些 bug 大部分都是這輪自己在快速迭代版面時造成、又自己修正的**，記錄下來是提醒下一位接手者：這個專案的財務模組現在互動邏輯很多，改動時務必用 `node --check` + jsdom 模擬渲染（這輪大量使用這個方法抓 bug，`/home/claude` 底下有現成的測試模式可以參考本文件附的程式碼片段）再交付，不要只憑肉眼看程式碼。

---

## 三、目前財務模組的完整技術架構快照

- **`finance_accounts`**：id, name, purpose, category(asset/liability), balance, display_order, count_in_available。**不再有 `account_type` 欄位的表單/顯示**（欄位還在資料庫，但前端不使用）。
- **`finance_transactions`**：新增 `budget_item_id`（可為空），其餘沿用 Phase 2。
- **`finance_budget_items`**：見上方 2.1 完整欄位。
- 主要函式（`script.js`）：
  - `getBudgetItemPaidAmount(item)` — 每月固定型算本月交易，累積儲蓄型不會呼叫這個（直接讀 `accumulated_amount`）
  - `getAccountOutstandingCommitment(accountId)` — 只有累積儲蓄型的 `accumulated_amount` 會被扣，每月固定型不影響
  - `getAccountAvailable(account)`、`computeAvailableFundsForecast()`、`computeNextMonthFixedByAccount()` — 可運用資金與提醒清單的核心計算
  - `buildFinanceAccountBudgetPanel(account, items)` — 帳戶詳情彈窗內容（進度＋存入）
  - `buildBudgetItemsListForAccount(account, items)` — 管理資金分配資料庫第二層內容（編輯/刪除/歸零/拖曳）
  - `buildBudgetAccountSummaryRow(account, items)` — 管理資金分配資料庫第一層的精簡帳戶列
  - `openFinanceAccountDetailModal` / `openFinanceBudgetAccountModal` — 兩個不同用途的彈窗（前者是主畫面查看，後者是管理彈窗第二層），**不要搞混，這是刻意分開的兩個彈窗，各自對應不同的使用情境**

---

## 四、Parking Lot 現況（只列這輪有變動的，其餘沿用 v8）

- **#005** Notion 筆記分頁測試——沿用 v8，無變動（已關閉，保留觸發）
- **#006** 打造 LifeOS 原生筆記系統——沿用 v8，無變動（仍未定案）
- **#010** 財務資訊互動式視覺化呈現（3D／Business Analytics 風格）——沿用 v8，這輪討論過帳戶展開時要不要做小型 2D 環形圖當輔助視覺，最後決定先不做，維持文字+進度條，**觸發條件不變**
- **#011（新增）AI 語意自動分類**——見上方 2.5，規則式智慧預填如果準確度不夠，之後可以考慮接 AI，這輪沒有實作，純粹是討論過程中的備案
- **#012（新增）跨帳戶搬動分配項目**——分配項目的拖曳排序目前只能在同一帳戶內部調整，跨帳戶搬動要用「編輯」改帳戶欄位。這是刻意先控制的範圍，不是技術做不到，觸發條件：使用者實際使用後如果常需要跨帳戶搬動，再回頭做

---

## 五、下一步建議（依優先順序）

1. **最優先**：把本文件第二節整理成正式的 Log #014，補進使用者實際保管的 Development Log 檔案——這件事這個 session 做不到（沒有那份檔案的寫入權限），需要使用者主動在下一個 session 提供該檔案並請 Claude 幫忙整理
2. 財務模組功能面這輪已經走得很完整，如果使用者沒有新的財務需求，可以問使用者要不要轉往**反思**（想加 AI 回饋）或**個人狀態**（雛形階段）繼續開發
3. 如果使用者還有財務相關的細節想調整，直接從本文件第二/三節接續即可，不用重新問一輪「你想做什麼」

## Current Biggest Blocker

沒有阻塞專案前進的技術問題。這輪結束時功能面已經確認沒問題，剩下的都是「要不要繼續深入」的意願問題，不是技術問題。
