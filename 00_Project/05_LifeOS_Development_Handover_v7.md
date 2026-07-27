# LifeOS Development Handover v7

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
4. LifeOS Development Log（倒序排列，最新的在最上面，請務必讀到 **Log #012**）
5. DD-001 LifeOS Finance Architecture（md 版，已正式取代先前的 docx 版）
6. Development Handover（本文件）

六份文件都讀完再開始動手。本次交接距離上一版 Handover（v6）隔了一整輪財務模組 Phase 2 的開發、上線、跟使用者實際使用回饋的密集迭代。這輪交接最重要的一件事是：**財務模組現在是使用者每天在用的東西了**，不再只是設計討論——接下來任何改動都要考慮到「會不會動到使用者正在累積的真實記帳資料」。

## 0. Current Status（30 秒快速閱讀）

LifeOS Status：**Feature Expansion**（延續 Log #006 開始的階段，沒有變動）

Current Phase：
✅ MVP 完成
✅ Supabase 雲端同步完成
✅ 四大核心功能雲端化完成
✅ Google OAuth 登入完成
✅ 五分頁導覽架構上線
✅ Notion 整合 Phase 1＋2 完成並上線
✅ **財務模組 Phase 1（資產總覽／淨資產快照）完成並上線**，並經過一輪資料模型修正（資產類型/負債類型分離，見 Log #012 第二、三節）
🆕 ✅ **財務模組 Phase 2（記帳）完整開發、上線，使用者正在實際使用**：`finance_transactions` 表、支出/收入/轉帳三種類型、記帳自動連動帳戶餘額（含資產/負債方向修正）、分類標籤、帳戶拖曳排序、帳戶管理模式、懸浮記帳按鈕、獨立明細彈窗
🆕 財務模組 Phase 3（預算 vs 實際比較、現金流拆分、週期性提醒）**尚未開發，且明確決定先不啟動**：使用者選擇先實際走過一次真實領薪週期，驗證 Phase 2 好不好用，再回頭啟動

Current Focus：
1. **使用者正在實際記帳**：先把 2026 年 7 月歷史資料補完（含建立信用卡帳戶、測試刷卡/結算流程），接著改成即時記帳，走完至少一次完整領薪週期
2. Notion 筆記分頁測試（沿用多版，狀態未變，仍是待驗證項目，這次沒有新進展）

Current Biggest Open Question：
沒有阻塞專案前進的技術問題。**Phase 3 何時啟動，取決於使用者是否已經完整走過一次真實領薪週期**（見本文件第 4 節的檢查清單），不要主動催促。「打造屬於 LifeOS 原生的筆記系統」（Parking Lot #006）方向仍未定案，同樣不要主動催促規劃。

## 1. 專案現況總覽

- **已上線網址**：`https://haotian030.github.io/LifeOS/`（沿用 v6，無變動）
- **雲端服務**：Supabase（沿用 v6，無變動）
- **登入功能**：雙軌並存，Google OAuth 為主力（沿用 v6，無變動）
- **資料現況**：Todo／Goal／Reflection／User Stats／`finance_accounts`／**新增 `finance_transactions`**（Phase 2）
- **財務模組**：Phase 1＋2 都已上線，使用者正在用真實資料測試

## 2. 財務模組技術架構（本次新增/變更部分）

### 2.1 DD-001 版本（Log #012 決策四十八）

DD-001 現在有正式 md 版本，**取代先前討論階段的 docx 版**，之後所有更新都以 md 版為準。核心架構：Facts（財務事實）／Intentions（人生規劃）／Insights（系統洞察）三層，目前程式碼完全符合這個架構，開發任何新功能前，先確認有沒有跨越這三層（例如不能讓 Purpose 改變資產本質）。

### 2.2 `finance_accounts` 欄位語意修正（Log #012 決策四十九、五十）

- 用途欄位 placeholder 改成敘述句範例，避免誤導成正式分類
- 資產類型／負債類型拆成兩套獨立的 datalist 建議清單，依「資產/負債」動態切換，帳戶命名慣例：同類型跨銀行帳戶（如多張信用卡）靠帳戶名稱區分，不靠 account_type 區分

### 2.3 `finance_transactions`（Phase 2，已上線）

```sql
create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  account_id uuid references finance_accounts(id),
  from_account_id uuid references finance_accounts(id),
  to_account_id uuid references finance_accounts(id),
  amount numeric not null check (amount > 0),
  category text,
  tag text,
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz default now()
);
```

RLS 限本人讀寫。`category`（用途備註，自由文字，描述細節）與 `tag`（分類標籤，datalist，負責分組/篩選）是兩個不同角色的欄位，不要合併，這是 Log #012 第五節明確定案的設計。

**重大決策：記帳同時自動連動帳戶餘額**（不是預設假設，是明確問過使用者後的選擇）。核心函式 `computeFinanceBalanceDelta(account, rawDelta)`——**資產帳戶跟負債帳戶的餘額方向是相反的**：資產帳戶「支出」餘額減少，負債帳戶「支出」餘額增加（欠更多）。**任何未來要動到餘額計算的地方，都要先確認有沒有處理這個方向差異，這是本輪修正的一個真實 bug，之後不要退回去。**

### 2.4 使用者真實帳戶盤點（沿用 v6，決策四十七，無變動）

見 v6 原文，帳戶用途盤點沒有新變化，只是使用者這次交接期間依照修正後的欄位定義重新建立了一次帳戶（土地銀行、中國信託、玉山銀行、郵局、元大證券、臺灣銀行、遠東銀行，加上負債類的信用卡/保單信貸）。

### 2.5 前端架構（本次全面重寫的部分）

- **懸浮記帳按鈕**（🧾）：固定在畫面角落，點擊開啟「快速記帳」彈窗（只有表單：類型切換／帳戶／金額／日期／用途備註／分類標籤）
- **記帳明細**：獨立彈窗，透過資產總覽標題旁的 📜 圖示開啟，含月份／標籤篩選，依月份自動分組
- **帳戶管理模式**：資產總覽標題旁的 🔧 圖示開關。關閉時帳戶項目只顯示名稱／用途／金額；開啟後才顯示拖曳把手／編輯／刪除
- **拖曳排序**：Pointer Events 手刻（不依賴套件），支援 2D（上下左右，適應桌面多欄 Grid）、拖曳中即時提示插入位置、靠近螢幕邊緣自動捲動。放開時才判定最終位置，不是拖曳中即時交換
- **桌面版多欄顯示**：資產/負債清單用 CSS Grid，畫面較窄時固定 2 欄，≥1100px 才變 3 欄
- **帳戶預設值**：純前端 `localStorage`，記住「支出/收入/轉帳來源/轉帳目標」各自最後選的帳戶，自動預選

### 2.6 CSS 技術債提醒（重要，供之後開發參考）

這次交接過程中至少兩次踩到「新樣式寫了但沒生效、甚至更糟」的狀況，原因都是**同選擇器優先權打平時，寫在檔案後面的規則會贏，跟 media query 條件無關**。之後要覆蓋既有樣式，如果不確定順序安不安全，直接放在 `style.css` 檔案最後面，不要塞在檔案中段。

## 3. Notion 整合、五分頁導覽、四個核心功能

沿用 v6，無變動。

## 4. Phase 3 啟動前的檢查清單（下次接手請先確認這裡）

使用者已明確決定：**先實際走過一次真實領薪週期，再啟動 Phase 3**。下次接手前，請先問使用者這三件事是否都發生過：

1. 是否已經從「回填歷史資料」改成「即時記帳」，並完整走過至少一次領薪週期（領薪→分配→保費/信用卡結算）？
2. 信用卡「刷卡→匯款→結算」的完整流程，是否已經實際測試過，且餘額方向正確（見 2.3 節的方向修正）？
3. 月底核對一次自動算出來的餘額，跟銀行 App 實際顯示的數字，對不對得起來？

**三件事都確認過、且使用者主動想開始，才啟動 Phase 3。不要主動催促。**

## 5. Parking Lot 現況

- **#001** 財務／健康真實資料來源——財務部分持續進行中（Phase 1+2 上線並實際使用），健康部分仍未觸發
- **#002～#007** 沿用 v6，無變動
- **#008** 應分配邏輯（帳戶內部多用途拆分）——**已透過分類標籤（Tag）機制解決**，不需要再拆帳戶，見 Log #012 第五節
- **#009（新增）** Intentions 層新增 Goal 欄位，並研究財務模組與「待辦與目標」模組互動的可能性——未觸發，待 Phase 2 累積足夠真實使用經驗、且 Goal 與 Purpose 的區別想清楚後再評估
- **#010（新增）** 財務資訊互動式視覺化呈現（使用者原始想法是類似 Business Analytics 儀表板的圖表，能隨資料增減即時反映）——未觸發，對應 DD-001 的 Insights 層，跟 Phase 3／4 範圍重疊，待資料累積足夠再認真評估呈現形式

## 6. 下一步建議（依優先順序）

1. **使用者持續記帳**：補完 7 月歷史資料（含信用卡帳戶建立與結算流程測試）、接著即時記帳走完至少一次真實領薪週期
2. **月底核對**：自動算出的餘額跟銀行 App 實際數字是否一致，這是 Phase 2 是否真正可靠的關鍵驗證
3. Phase 3（預算分配表）開發時機：**等第 4 節的檢查清單都確認過、使用者主動提出，再回頭啟動**，屆時直接參考使用者先前提供的預算分配表真實案例（分類＋預估金額＋領薪時分配＋追蹤已用/剩餘），不需要重新設計
4. Notion 筆記分頁測試、「打造自己筆記系統」方向，都沿用 v6，持續延後，無明確需求前不處理

## Current Biggest Blocker

沒有真正卡住專案前進的技術阻塞點。財務模組正處於「Phase 2 上線、使用者實際使用中」的階段，下一個里程碑是「走完一次真實領薪週期」，這需要時間，不是技術問題。
