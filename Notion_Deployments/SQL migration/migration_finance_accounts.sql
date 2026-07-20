-- LifeOS 財務模組 Phase 1：資產總覽／淨資產快照
-- 對應 Development Log #010 決策四十一

create table finance_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,              -- 帳戶名稱，例如「土地銀行」
  purpose text,                    -- 用途，例如「薪資帳戶」
  category text not null,          -- 'asset'（資產）或 'liability'（負債）
  account_type text,               -- '現金' / '銀行' / '投資' / '保單' / '加密貨幣' / '其他'
  balance numeric not null default 0,
  display_order int default 0,
  updated_at timestamptz default now()
  -- updated_at 先預留給 Phase 3（現金流貢獻 vs 市值波動拆分、判斷帳戶多久沒更新）使用，
  -- Phase 1 暫不處理相關邏輯。
);

alter table finance_accounts enable row level security;

create policy "使用者只能存取自己的財務帳戶"
on finance_accounts
for all
using (auth.uid() = user_id);
