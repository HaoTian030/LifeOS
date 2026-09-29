# LifeOS Development Handover v2

---
## 本文件回答：
* Handover 描述的是目前狀態，若與 Development Log 發生差異。
* 以最新 Handover 為主，並將新的重大決策補進下一篇 Development Log。

* Question：Where We Are Now
* Purpose：提供目前專案狀態與下一步工作。
* Update Frequency：每次交接前更新。
---

## 0. 給下一位接手的 Claude

開始前請依序完整閱讀：
1. AI Collaboration Charter
2. LifeOS Manifesto
3. LifeOS Current Project Context
4. LifeOS Development Log（倒序排列，最新的在最上面，請務必讀到 Log #003）
5. Development Handover

五份文件都讀完再開始動手。

## 1. 專案現況總覽

LifeOS 正在從「純前端＋localStorage」過渡到「前端＋雲端資料庫」，目前狀態：

- **已上線網址**：`https://haotian030.github.io/LifeOS-Online/`（GitHub Pages）
- **雲端服務**：Supabase（Project URL: `https://jtnmrikpgixlqxnudxob.supabase.co`）
- **登入功能**：已完成，採用 **OTP（6 位數驗證碼）**，**不是 Magic Link**——這點務必看清楚，中途翻案過一次，不要誤用舊方案
- **寄信服務**：已設定自訂 SMTP（Resend），Sender email 目前是 `onboarding@resend.dev`（尚未驗證自訂網域，只能寄給註冊 Resend 帳號用的那個信箱，之後開放給朋友用前需要先驗證網域）
- **資料現況**：Todo／Goal／Reflection 三大核心功能，**資料讀寫目前仍是 localStorage**，尚未串接 Supabase 資料表——登入功能跟資料讀寫是兩件獨立的事，登入好了不代表資料已經雲端化

## 2. 四個核心功能現況

| 功能 | 狀態 | 資料保留哲學 |
|---|---|---|
| 今日代辦 | 穩定，localStorage | 服務今天，不留歷史，完成即捨棄 |
| 本週目標 | 穩定，localStorage，每週重置機制已完成 | 服務人生階段，完成項目永久保留（`goalHistory`） |
| 今日反思 | 穩定，localStorage，呈現方式已收斂為 modal＋自動長高輸入框 | 服務未來的自己，完整保留所有歷史 |
| 玩家面板 | 穩定，等級/經驗值用獨立累計計數器 | 財富／健康仍是假資料，尚未串接真實來源 |

## 3. Supabase 資料庫現況（已建立，尚未串接前端）

4 張表已建立，Row Level Security 已設定完成：

- **`todos`**：今日代辦＋待處理代辦合併，用 `status`（`active`/`pending`）區分
- **`goals`**：本週目標＋待處理目標＋目標歷程合併，用 `status`（`active`/`pending`/`history`）區分，含 `completed_date`、`counted` 欄位
- **`reflections`**：獨立一張表，含 `date` 欄位
- **`user_stats`**：一人一筆，存 `total_completed_todos`、`total_completed_goals`、`last_todo_date`、`last_goal_week_start`

`goals` 的 history 狀態與整張 `reflections` 表都**沒有開放前端刪除權限**，維持永久保留原則。**已確認跳過舊資料搬家**（使用者確認目前都是測試資料，不需要處理遷移）。

## 4. 登入功能技術細節（OTP，非 Magic Link）

- 前端串接 Supabase JS 函式庫（CDN 引入：`@supabase/supabase-js@2`）
- 流程：使用者輸入 email → 呼叫 `signInWithOtp({ email })`（**不傳** `emailRedirectTo`）→ 使用者收信取得 6 位數字 → 輸入畫面 → 呼叫 `verifyOtp({ email, token, type: "email" })` → 登入成功
- Supabase 後台 Authentication → Email Templates → Magic Link 樣板已加入 `{{ .Token }}` 變數，讓信裡出現驗證碼（**光靠程式碼不傳 `emailRedirectTo` 不夠，樣板本身也要手動加這個變數，兩者缺一不可**）
- 已在 Authentication → SMTP Settings 設定 Resend 作為自訂 SMTP，解決 Supabase 內建服務「樣板鎖死＋每小時限 2 封信」的限制
- 目前 Sender email 用 Resend 測試網域 `onboarding@resend.dev`，**只能寄給註冊 Resend 帳號的那個信箱**，尚未驗證自訂網域，開放給朋友前必須先處理這一步

## 5. 部署與跨裝置的技術背景（重要，務必先理解這段）

- LifeOS 架在 GitHub Pages，任何裝置打開同一個網址都是同一份程式碼，**但 GitHub Pages 更新後生效有數分鐘延遲**，測試結果不如預期時，先排除「還沒部署生效」，別急著往程式碼邏輯排查
- **資料讀寫目前仍是 localStorage**：即使已上線、也已經能登入，桌機跟手機打開同一個網址、登入同一個帳號，看到的還是各自瀏覽器獨立的資料，不會同步——這個問題要等「資料串接 Supabase」那一步完成才會真正解決，千萬不要誤以為「登入功能做完＝跨裝置同步已經完成」
- 使用者核心動機：主要是自己跨裝置同步（桌機筆電資料一致），其次才是分享給朋友用
- 自架伺服器（脫離 Supabase 雲端版本）已排入 Parking Lot #003，刻意延後的未來目標，現階段不做

## 6. 下一步建議順序

1. **只換 Todo 這一塊**：把 `loadTodos`／`saveTodos` 等函式改成讀寫 Supabase 的 `todos` 表，Goal、Reflection 暫時維持 localStorage 不動，先驗證「一塊資料源頭換掉、且跟登入的 user_id 綁定」整個流程是通的
2. Todo 驗證沒問題後，依序換 Goal、Reflection、`user_stats`
3. 全部串接完成後，才是財富模組（Parking Lot 已有初步構想：每日記帳、每月回顧、每年核銷，但功能細節都還沒討論，屬於「先想清楚再做」階段）

## 7. 多裝置協作提醒

- 本機開發、測試階段時，桌機／筆電的檔案仍要三個檔案（`index.html`／`script.js`／`style.css`）一起換，不要拆開只換部分——這條已經因為實際踩雷驗證過兩次必要性
- 改用 GitHub Pages 部署後，「多裝置檔案不同步」問題已大幅降低，因為只有一份程式碼放在雲端，但推送到 GitHub 之後記得等部署生效再測試

## 8. Parking Lot 現況

- **#001** 財務／健康改真實資料來源——未觸發
- **#002** 本週目標週期可調整（週→月/年）——未觸發
- **#003** 自架伺服器（脫離 Supabase 雲端版本）——未觸發，使用者明確表示這是「想挑戰」的未來目標，等 LifeOS 核心功能都串接完成、穩定運作後再考慮