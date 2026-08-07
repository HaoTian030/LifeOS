-- LifeOS Phase 3：財務分配（分配總覽）
-- 請在 Supabase 的 SQL Editor 手動執行這份 migration，執行前建議先確認目前沒有
-- 正在進行中的記帳操作（避免執行過程中資料表結構跟前端暫時不一致）。

-- 1. 新增 finance_budget_items 資料表（DD-001 Intentions 層落地）
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
  created_at timestamptz default now()
);

alter table finance_budget_items enable row level security;

create policy "finance_budget_items_select_own"
  on finance_budget_items for select
  using (auth.uid() = user_id);

create policy "finance_budget_items_insert_own"
  on finance_budget_items for insert
  with check (auth.uid() = user_id);

create policy "finance_budget_items_update_own"
  on finance_budget_items for update
  using (auth.uid() = user_id);

create policy "finance_budget_items_delete_own"
  on finance_budget_items for delete
  using (auth.uid() = user_id);

-- 2. finance_transactions 新增 budget_item_id，交易直接關聯到分配項目
--    （不用 tag 文字比對，因為同帳戶常有多個同類型但用途不同的分配項目）
alter table finance_transactions
  add column budget_item_id uuid references finance_budget_items(id);
