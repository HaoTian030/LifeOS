# LifeOS Development Handover v3

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
4. LifeOS Development Log（倒序排列，最新的在最上面，請務必讀到 **Log #004**）
5. Development Handover（本文件）

五份文件都讀完再開始動手。本次交接距離上一版 Handover（v2）只隔一次開發階段，但這次是關鍵的一次：**四大核心功能的雲端化已經全部完成**，這是專案目前最重要的狀態變化，務必先確認清楚再往下規劃。

## 0. Current Status（30 秒快速閱讀）

LifeOS Status：Beta Testing

Current Phase：
✅ MVP 完成
✅ Supabase 雲端同步完成
✅ OTP 登入完成
✅ 四大核心功能完成

Current Bottleneck：
朋友尚未能自行登入。

Reason：
Resend Sender Domain 尚未驗證。

Next Milestone：
完成 Resend Domain Verification
→ 開放朋友註冊
→ 收集 Beta Feedback

## 1. 專案現況總覽

LifeOS 已經完成「前端＋雲端資料庫」的完整串接，不再是純前端＋localStorage：

- **已上線網址（正式版）**：`https://haotian030.github.io/LifeOS/`（注意：v2 版 Handover 記錄的是舊網址 `LifeOS-Online`，這次已更正）
- 使用者另外維護一份**朋友測試用的精簡版網址**，只保留今日代辦／今日反思／本週目標／目標歷程 4 張卡（拿掉玩家面板、財富面板、學習進度、投資監控等卡片），**尚未正式邀請朋友使用**，目前只有使用者自己測試過
- **雲端服務**：Supabase（Project URL: `https://jtnmrikpgixlqxnudxob.supabase.co`）
- **登入功能**：OTP（6 位數驗證碼），沿用 v2 版的定案，這次沒有變動
- **寄信服務**：自訂 SMTP（Resend），Sender email 仍是 `onboarding@resend.dev`，**尚未驗證自訂網域**，只能寄給註冊 Resend 帳號的那個信箱——這件事還沒處理，開放給朋友前必須先做
- **資料現況（本次最大變化）**：Todo／Goal／Reflection 三大核心功能**已經全部從 localStorage 換成讀寫 Supabase**，並跟登入的 `user_id` 綁定，跨裝置同步問題已經解決。詳細技術細節見第 2、3 節。

## 2. 四個核心功能現況

| 功能 | 狀態 | 資料來源 | 資料保留哲學 |
|---|---|---|---|
| 今日代辦 | 穩定，**已串接 Supabase** | `todos` 表 | 服務今天，不留歷史，完成即捨棄 |
| 本週目標 | 穩定，**已串接 Supabase**，每週重置機制沿用 | `goals` 表 | 服務人生階段，完成項目永久保留（`status='history'`） |
| 今日反思 | 穩定，**已串接 Supabase** | `reflections` 表 | 服務未來的自己，完整保留所有歷史 |
| 玩家面板 | 穩定，等級/經驗值計數器改讀 `user_stats` | `user_stats` 表 | 財富／健康仍是假資料，尚未串接真實來源 |

未登入時，Todo／Goal／Reflection 三者都會套用**「示範模式」**：顯示寫死在程式碼裡的示範資料，可以正常互動（打勾/新增/刪除），但純粹是記憶體操作，重新整理頁面就恢復原狀，不會寫進 localStorage 也不會寫進 Supabase。唯一例外是**目標歷程**：未登入時不顯示示範資料，改顯示提示文字「登入後即可查看你的目標歷程紀錄」，因為這份資料的意義是「永久保留的人生痕跡」，套用假資料會混淆這個意義。

## 3. Supabase 資料庫現況（4 張表全部已串接前端）

```sql
-- todos：今日代辦＋待處理代辦合併，用 status 區分
create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  status text not null default 'active' check (status in ('active', 'pending')),
  created_at timestamptz not null default now()
);

-- goals：本週目標＋待處理目標＋目標歷程合併，用 status 區分
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  status text not null default 'active' check (status in ('active', 'pending', 'history')),
  completed_date date,
  counted boolean not null default false,
  created_at timestamptz not null default now()
);

-- reflections：反思，維持獨立一張表
create table reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- user_stats：累計計數器與跨天/跨週檢查用的日期戳記，一人一筆
create table user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_completed_todos integer not null default 0,
  total_completed_goals integer not null default 0,
  last_todo_date date,
  last_goal_week_start date
);
```

**RLS policy 現況（本次有補一條）**：
- `todos`／`goals`／`user_stats`：select／insert／update／delete 四條 policy 齊全
- `reflections`：這次補上了 update policy（原本只有 select／insert／delete，導致「同一天第二次儲存」失敗），四條 policy 現在也齊全了

**已確認跳過舊資料搬遷**：Goal 原本有一段處理「沒有 `counted` 標記的舊資料」的相容邏輯（`migrateLegacyCompletedGoals`），這次已經直接移除，不搬過去，因為目前所有資料都是測試資料。

## 4. Todo／Goal／Reflection 前端邏輯重點（給下一位接手者的技術地圖）

**共用模式**：三個功能都有一組平行的函式命名，方便之後維護時對照：
- `xxxFromSupabase()`：登入後讀取雲端資料，映射成前端習慣的物件格式
- `initXxxForUser()`：登入時觸發，依序處理跨天/跨週檢查 → 讀取資料 → 渲染畫面
- `initXxxForGuest()`：登出時觸發，套用示範資料、純記憶體操作
- 這三組初始化函式，都是在 `showLoggedIn()` / `showLoggedOut()` 裡被呼叫，不是在檔案底部的初始化區塊直接呼叫（這點跟 v2 版之前的寫法不同，之後如果要debug「資料沒載入」的問題，要先確認登入狀態的事件流程有沒有正常觸發）

**跨天／跨週判斷**：
- Todo：`checkTodoDayRolloverCloud()`，比對 `user_stats.last_todo_date`
- Goal：`checkGoalWeekRolloverCloud()`，比對 `user_stats.last_goal_week_start`
- 兩者邏輯結構相同：日期不同 → 批次更新符合條件的資料列狀態 → 更新 `user_stats` 的日期欄位

**Todo 待處理清單三顆按鈕**：延到今天（`status`改回`active`）／加入本週目標（寫進 `goals` 表，`todos` 該筆刪除）／放棄（`todos` 該筆刪除）

**Goal 待處理清單兩顆按鈕**：繼續保留（`status`改回`active`）／放棄（該筆刪除）

**日期格式提醒**：Supabase 的 `date` 型別欄位，JS 端拿到的字串格式是 ISO 格式（`YYYY-MM-DD`），跟原本 localStorage 版本用 `toLocaleDateString("zh-TW")` 存的格式（`2026/7/13`）不一樣。程式碼裡統一用 `todayDateString()` 和 `thisSundayDateString()` 兩個工具函式產生 ISO 格式字串，之後若要新增任何跟日期有關的邏輯，記得延用這兩個函式，不要混用 `toLocaleDateString`。

**防呆機制**：財富面板、玩家面板等直接操作 DOM 的程式碼，已經加上元素存在檢查（`setTextIfExists()` 工具函式，或直接 `if (element)` 判斷），目的是讓同一份 `script.js` 能同時服務「完整版」與「朋友測試精簡版」兩種不同的 HTML，不會因為某張卡片被拿掉而讓整支程式中斷。**之後如果新增任何直接寫 `document.getElementById(...).innerText = ...` 的程式碼，都要沿用這個防呆習慣。**

## 5. 部署與跨裝置的技術背景（延續 v2，補充最新狀況）

- LifeOS 架在 GitHub Pages，**正式網址已更新為** `https://haotian030.github.io/LifeOS/`
- GitHub Pages 更新後生效有數分鐘延遲，這點跟 v2 版一樣沒變，測試結果不如預期時先排除「還沒部署生效」
- **跨裝置同步問題已經解決**：本次雲端化完成後，桌機、手機打開同一個網址、登入同一個帳號，資料是真正同步的，這是本次交接前最核心的一項驗證，已經測試通過

## 6. 測試方法備忘（給下一位接手者，很實用）

這次開發過程中發現，很多操作路徑（待處理清單、跨天/跨週判斷、多篇反思的歷史紀錄）很難透過正常操作自然觸發，也發現 Supabase 後台 Table Editor 手動改資料常常不可靠（編輯沒真的存進去、新增資料要填 uuid 很麻煩）。**最有效的測試方式是直接在瀏覽器 F12 開發者工具的 Console 分頁，貼上 Supabase JS 指令執行**，例如：

```js
// 查看目前登入使用者的 user_stats
supabaseClient.from('user_stats').select('*').eq('user_id', currentUser.id).then(r => console.log(r))

// 手動把某筆 active 的 todo 改成 pending，測試待處理清單
supabaseClient.from('todos').update({status:'pending'}).eq('user_id', currentUser.id).eq('status','active').eq('done', false).then(r => console.log('結果:', r))

// 模擬跨天，把 last_todo_date 改成昨天
supabaseClient.from('user_stats').update({last_todo_date:'2026-07-11'}).eq('user_id', currentUser.id).then(r => console.log('結果:', r))
```

之後如果要繼續測試財富模組或其他新功能，建議延用這個方式，比在 Supabase 後台 UI 上操作快很多也準確很多。

**小提醒**：如果測試時 Console 意外跳出跟 Supabase 完全無關的紅字錯誤（例如瀏覽器裝了 Phantom 錢包之類的擴充功能），先檢查 DevTools 右側「中斷點」設定裡有沒有勾選「在遇到例外狀況時暫停」，這個設定會攔截整個瀏覽器裡任何網站的任何錯誤，容易誤判成自己的程式碼壞掉。

## 7. Parking Lot 現況

- **#001** 財務／健康改真實資料來源——未觸發
- **#002** 本週目標週期可調整（週→月/年）——未觸發
- **#003** 自架伺服器（脫離 Supabase 雲端版本）——未觸發，使用者明確表示這是「想挑戰」的未來目標，等 LifeOS 核心功能都串接完成、穩定運作後再考慮——**這個條件現在已經達成，未來可以視情況重新評估是否觸發**

本次沒有新增 Parking Lot 項目。

## 8. 下一步建議（兩條路線，由使用者決定優先順序）

1. **正式邀請朋友測試**精簡版網址（4 張卡），實際收集第一手回饋，順便驗證防呆機制在真實使用情境下是否足夠
2. **開始討論財富模組**細節設計——目前只有「每日記帳、每月回顧、每年核銷」的初步構想，功能細節都還沒討論，屬於「先想清楚再做」階段
3. 若要開放給朋友使用，記得處理 **Resend 自訂網域驗證**，目前 Sender email 只能寄給註冊 Resend 帳號的那個信箱，這是延續 v2 版就存在、還沒處理的既有事項

## Current Biggest Blocker

目前真正阻礙專案前進的，不是程式。
而是：
Resend Domain Verification。

只要完成：
朋友即可開始使用自己的 Email。

因此目前所有工作，應以突破這件事情為最高優先。
除非使用者主動要求新增功能，否則不要開始擴充模組。