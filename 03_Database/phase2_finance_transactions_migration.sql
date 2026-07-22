-- LifeOS 財務模組 Phase 2：finance_transactions
-- 對應 Development Log #011 決策四十五，以及本輪交接討論定案的欄位設計。
-- 請在 Supabase SQL Editor 執行一次即可。

create table finance_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,

  -- 'income' | 'expense' | 'transfer'
  type text not null check (type in ('income', 'expense', 'transfer')),

  -- income / expense 用單一帳戶；transfer 用來源/目標兩個帳戶。
  -- 三者互斥使用，前端依 type 決定填哪一組，這裡不加資料庫層級的互斥檢查，
  -- 保持彈性（例如未來若要放寬規則，不需要改 schema）。
  account_id uuid references finance_accounts(id),
  from_account_id uuid references finance_accounts(id),
  to_account_id uuid references finance_accounts(id),

  amount numeric not null check (amount > 0),

  -- 用途備註，自由文字，對應 Log #011 決策四十七／2.5 節：
  -- 不強制分類，讓使用者自己標記用途即可。
  category text,

  occurred_on date not null default current_date,
  note text,
  created_at timestamptz default now()
);

alter table finance_transactions enable row level security;

create policy "Users can manage own finance transactions"
  on finance_transactions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index finance_transactions_user_id_idx on finance_transactions (user_id);
create index finance_transactions_occurred_on_idx on finance_transactions (occurred_on desc);
