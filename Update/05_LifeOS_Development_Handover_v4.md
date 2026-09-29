# LifeOS Development Handover v4

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
4. LifeOS Development Log（倒序排列，最新的在最上面，請務必讀到 **Log #007**）
5. Development Handover（本文件）

五份文件都讀完再開始動手。本次交接距離上一版 Handover（v3）隔了四次重要的開發階段（Log #004～#007），內容變動不小，務必先確認清楚再往下規劃，尤其是 **Beta Stage 已經正式結束、Exit Condition 的定義也被修正過**，不要再用 v3 舊版的三個條件去判斷專案現況。

## 0. Current Status（30 秒快速閱讀）

LifeOS Status：**Feature Expansion**（原 Beta Preparation，已於 Log #006 確認結束）

Current Phase：
✅ MVP 完成
✅ Supabase 雲端同步完成
✅ 四大核心功能雲端化完成
✅ Google OAuth 登入完成，女友已實測成功登入並提供真實回饋
✅ 五分頁導覽架構已定案（Log #007）

Current Focus：
把定案的五分頁導覽架構做出來，並讓 Notion 整合 Phase 1 直接歸位進新架構的「Notion 筆記」分頁

Current Biggest Open Question（不是阻塞，是需要先問過使用者的事）：
精簡版朋友測試網址（4 張卡）要不要也套用新的五分頁架構，這個問題在 Log #007 提出但沒有得到明確答覆，**開始實作導覽架構前務必先問清楚**。

## 1. 專案現況總覽

LifeOS 目前是「前端＋雲端資料庫＋雙登入方式」的完整狀態：

- **已上線網址（正式版）**：`https://haotian030.github.io/LifeOS/`
- 朋友測試用的精簡版網址（4 張卡：今日代辦／今日反思／本週目標／目標歷程）沿用 v3 時期的設計，尚未套用本次新定案的導覽架構，見上方「Current Biggest Open Question」
- **雲端服務**：Supabase（Project URL: `https://jtnmrikpgixlqxnudxob.supabase.co`）
- **登入功能：雙軌並存**
  - Email OTP（v3 時期的舊路徑）——**目前實際上處於半失效狀態**，因為 Resend 自訂 SMTP 已關閉、改回 Supabase 內建寄信，內建寄信服務不支援自訂樣板，會強制退回連結式 Magic Link，且連結會有過期問題，這條路線目前不建議請朋友使用
  - **Google OAuth（Log #005 新增）——目前主要使用的登入方式**，已實測朋友能成功登入，且與同信箱的 Email OTP 帳號會被 Supabase 自動視為同一個 `user_id`，資料相通
- **資料現況**：Todo／Goal／Reflection／User Stats 四大核心功能皆已從 localStorage 換成讀寫 Supabase，跨裝置同步問題已解決（v3 時期完成，本次無變動）

## 2. Beta Exit Condition 的重新定義（重要，務必先理解）

v3 版本 Handover 訂的三項 Exit Condition（完成 Resend Domain Verification／至少 3 位朋友成功登入／收到第一輪 Beta Feedback）**已在 Log #006 被修正並確認全數達成**，Beta Stage 已正式結束。

修正後的定義與最終判定：

| 條件（修正後） | 狀態 |
|---|---|
| 有可用的登入方式讓非本人使用者能穩定使用 | ☑ 已達成（Google OAuth） |
| 至少 1-2 位親近的人實際使用並產生真實回饋 | ☑ 已達成（女友） |
| 收到第一輪 Beta Feedback | ☑ 已達成 |

修正原因：「3 位朋友」這個數字當初訂立時沒有註明理由，現實中身邊真正會用待辦清單類工具的人有限，硬湊數字會製造資安風險（開放陌生人存取雲端資料庫）。詳細討論過程見 Log #006。

**Resend Domain Verification 依然沒有完成，也不是現在的優先事項**，除非之後有朋友明確需要或偏好 Email 登入而非 Google 帳號，才會是觸發訊號重新評估。

## 3. 目前最重要的功能方向：Notion 整合 ＋ 導覽架構重整

這兩件事是同一批討論定案的，彼此高度相關，缺一不可：

### 3.1 為什麼是 Notion 整合

女友（目前唯一的真實使用者）主動反饋：LifeOS 的待辦清單比 Notion 好用，希望能跟 Notion 連結（她習慣用 Notion 記事）。這是目前唯一有真實使用者明確提出、直接關係到使用者留存的需求，因此排在所有其他待辦事項（財富模組、Resend 網域等）之前。詳見 Log #006 決策二十三。

分兩階段規劃：
- **Phase 1（現在要做）**：把 Notion 筆記讀取進 LifeOS
- **Phase 2（Parking Lot #004，之後再評估）**：讓 LifeOS 的待辦資料同步／顯示回 Notion

技術現況（查證於 2026-07-16）：Notion 沒有第三方 UI 插件系統，第三方整合都是透過 API 讀寫資料；Public Integration 需要 OAuth ＋ Notion 官方安全審查才能對外發布；今年 5 月新推出的 Workers／資料庫同步機制，是目前最接近「LifeOS 資料出現在 Notion 裡」效果的可行路徑（Phase 2 會用到，Phase 1 不需要）。

### 3.2 為什麼要同時做導覽架構重整

Notion 整合 Phase 1 剛好就是會讓現有單頁版面變擁擠的第一張新卡片，兩件事時機重疊。討論後決定：與其先讓 Notion 當獨立卡片塞進舊版面、之後再搬進新架構（多做一次工），不如趁這次把導覽架構的設計一次定案，Notion Phase 1 直接以新架構的身份開發。詳見 Log #007 決策二十四、二十八。

### 3.3 導覽架構定案內容

**桌面：常駐側邊欄／手機：底部分頁列**，同一套程式碼透過 CSS media query 切換，不開發兩個獨立版本，延續 v3 時期就有的響應式設計機制（`@media (max-width: 480px)`）。

**五個分頁**：

| 分頁 | 包含內容 | 備註 |
|---|---|---|
| 待辦與目標 | 今日待辦、本週目標、目標歷程 | 三者堆疊呈現，不做子分頁；登入後預設落在這個分頁 |
| 反思 | 反思 | |
| 個人狀態 | 玩家面板、人物情報、學習進度 | RPG 風格延伸出的分類，**用途尚未正式定案**，內容開發優先順序排在最後 |
| 財務 | 本月財務、投資監控 | 目前是假資料，對應 Parking Lot #001 |
| Notion 筆記 | Phase 1 新功能 | 待開發 |

抽屜／彈出層視覺效果：沿用既有 History Modal／登入彈窗的半透明遮罩做法（背景變暗但看得到、不能互動），不是新機制。

**尚未定案、下次接手需要先問清楚的事**：精簡版朋友測試網址是否也要套用這套新架構（見上方「Current Biggest Open Question」）。

## 4. 四個核心功能現況（沿用 v3，本次無技術變動）

| 功能 | 狀態 | 資料來源 | 資料保留哲學 |
|---|---|---|---|
| 今日代辦 | 穩定 | `todos` 表 | 服務今天，不留歷史 |
| 本週目標 | 穩定 | `goals` 表 | 完成項目永久保留（`status='history'`） |
| 今日反思 | 穩定 | `reflections` 表 | 完整保留所有歷史 |
| 玩家面板 | 穩定，等級/經驗值讀 `user_stats` | `user_stats` 表 | 財富／健康仍是假資料 |

未登入時仍套用 v3 定案的「示範模式」（Log #004 決策十三、十四），本次無變動。

## 5. Supabase 資料庫現況（沿用 v3，Schema 本次無變動）

4 張表（`todos`／`goals`／`reflections`／`user_stats`）與 RLS policy 現況與 v3 版本完全相同，未變動。詳見 v3 或 Log #004。

新增的是 **Authentication 設定變動**：
- Google Provider 已啟用（Authentication → Providers → Google，憑證來自 Google Cloud Console 建立的 OAuth 用戶端）
- Site URL 已修正為 `https://haotian030.github.io/LifeOS/`（含完整子路徑），解決連結類登入導回網站撞到 404 的問題
- Enable Custom SMTP 目前是**關閉**狀態（改回 Supabase 內建寄信），這是 Email OTP 路徑目前半失效的原因，見上方第 1 節

## 6. 前端邏輯重點（更新）

**登入區塊 UI**：目前是「觸發按鈕＋彈出視窗」模式（Log #005 第二輪改版），未登入只顯示一顆「🔐 登入」按鈕，已登入只顯示一小條「👤 信箱／登出」，都不佔用主畫面版面。彈窗內同時提供 Email 驗證碼與 Google 登入兩個選項。相關 DOM id：`auth-guest-trigger`／`auth-open-modal-button`／`auth-modal-overlay`／`auth-modal-close`／`auth-logged-in`，其餘 Todo/Goal/Reflection 相關的既有 id（`auth-logged-out`／`auth-otp-row` 等）維持不變，只是現在被包在彈窗裡。

**共用模式、跨天/跨週判斷、待處理按鈕邏輯、日期格式**：與 v3 完全相同，未變動，詳見 v3 原文或 Log #004。

**尚未實作**：五分頁導覽架構目前只有設計定案（Log #007），程式碼還沒動手寫，下一位接手者的主要工作就是把它做出來。

## 7. 部署與跨裝置技術背景（沿用 v3，無變動）

GitHub Pages 部署方式、數分鐘生效延遲、跨裝置同步已解決，這些都與 v3 描述一致，未變動。

## 8. 測試方法備忘（沿用 v3，無變動）

F12 開發者工具 Console 分頁直接下 Supabase 指令的測試方式，依然是最有效的做法，詳見 v3 原文。

## 9. Parking Lot 現況

- **#001** 財務／健康改真實資料來源——未觸發，使用者目前用其他工具記錄，優先順序明確排在 Notion 整合之後
- **#002** 本週目標週期可調整——未觸發
- **#003** 自架伺服器——未觸發，使用者表示等 LifeOS 核心功能都穩定運作後可視情況重新評估，這個條件現在已經達成，但這次沒有被觸發（優先順序上 Notion 整合與導覽架構排更前面）
- **#004（Log #006 新增）** Notion 整合 Phase 2（LifeOS 資料同步／顯示回 Notion）——未觸發，需等 Phase 1 上線並驗證有效後再評估
- **#005（Log #007 新增）** 使用者自訂排版／自訂首頁——未觸發，目前只有一位真實使用者，沒有足夠真實摩擦佐證該開放哪些自訂選項

## 10. 下一步建議（依優先順序）

1. **先問清楚精簡版朋友測試網址要不要套用新的五分頁架構**，這是 Log #007 唯一沒有得到明確答覆的問題，直接影響實作範圍，不要用猜的
2. 實作五分頁導覽架構：桌面常駐側邊欄、手機底部分頁列，CSS media query 切換，抽屜/分頁切換邏輯延伸既有的 History Modal 遮罩機制
3. Notion 整合 Phase 1 直接在新架構的「Notion 筆記」分頁裡開發：規劃 OAuth 連結流程、決定要讀取顯示的內容範圍（單一頁面？特定資料庫？）
4. 持續讓女友使用並收集回饋，現實中同步嘗試接觸其他有在用待辦清單類工具的朋友，不強求數量
5. Resend 網域購買持續延後，無明確需求前不處理

## Current Biggest Blocker

目前沒有真正卡住專案前進的技術阻塞點（跟 v3 時期的 Resend 網域不同）。

**唯一需要先處理的，是一個尚未確認的資訊缺口**：精簡版網址是否要套用新架構，這會決定接下來實作的範圍大小，開始寫程式碼前務必先問清楚使用者。

除此之外，目前所有工作應以「導覽架構＋Notion 整合 Phase 1」為最高優先，除非使用者主動要求新增其他功能，否則不要開始擴充其他模組。
