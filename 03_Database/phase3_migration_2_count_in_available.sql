-- LifeOS Phase 3 追加修正：可運用資金池排除開關
-- 這是「本月結存」計算方式的修正，不是新功能。這份是獨立的第二份 migration，
-- 只新增這一個欄位，不會重複執行第一份 migration 已經跑過的部分（finance_budget_items
-- 資料表、finance_transactions.budget_item_id），可以直接執行，不用檢查第一份跑過沒有。

-- finance_accounts 新增 count_in_available，語意是「這個帳戶的錢，這個月要不要算進
-- 可運用資金池」，不綁定任何特定帳戶類型（投資型保單只是第一個要關閉的例子，
-- 之後任何「這筆錢先不算進本月可動用」的帳戶都可以用同一個開關處理）。
-- 預設 true：新舊帳戶都先維持「計入」，投資型保單這類既有帳戶執行完這份 migration 後，
-- 需要手動進「管理帳戶」把開關關閉一次（決策：不用 account_type 文字自動猜測要不要排除，
-- 因為那個欄位是自由輸入文字，猜不準）。
alter table finance_accounts
  add column count_in_available boolean not null default true;
