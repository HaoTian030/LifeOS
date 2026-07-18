-- LifeOS：Notion 整合 Phase 1
-- 每位使用者各自的 Notion Token／資料庫 ID，一人一筆，用 user_id 當主鍵
-- 請在 Supabase 後台 → SQL Editor 貼上執行一次

create table if not exists notion_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notion_token text not null,
  notion_database_id text not null,
  updated_at timestamptz not null default now()
);

alter table notion_connections enable row level security;

-- 只能讀寫「自己」的那一筆，其他人（包含你女友）完全看不到彼此的 Token
create policy "使用者只能讀取自己的 Notion 連線設定"
  on notion_connections for select
  using (auth.uid() = user_id);

create policy "使用者只能新增自己的 Notion 連線設定"
  on notion_connections for insert
  with check (auth.uid() = user_id);

create policy "使用者只能更新自己的 Notion 連線設定"
  on notion_connections for update
  using (auth.uid() = user_id);

create policy "使用者只能刪除自己的 Notion 連線設定"
  on notion_connections for delete
  using (auth.uid() = user_id);
