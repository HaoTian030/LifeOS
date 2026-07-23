-- LifeOS 財務模組 Phase 2 補充：finance_transactions 新增 tag 欄位
-- 對應本輪交接討論：「用途備註」與「分類標籤」是兩個不同角色（DD-001 Intentions 層的 Purpose vs Tags），
-- 用途備註負責描述細節，分類標籤負責讓明細可以有意義地分組/篩選。
-- 請在 Supabase SQL Editor 執行一次即可，是對既有 finance_transactions 表的追加變更，
-- 不影響已存在的資料（既有紀錄的 tag 會是 null）。

alter table finance_transactions add column tag text;
