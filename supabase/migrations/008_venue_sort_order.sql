-- ============================================
-- 百貨店マスターに sort_order カラムを追加して
-- D&D並べ替えに対応する
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. sort_order カラム追加（並び順、小さいほど先頭）
ALTER TABLE venue_master
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 2. 初期値を既存の venue_name 昇順で振る
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY venue_name) - 1 AS rn
  FROM venue_master
)
UPDATE venue_master v
SET sort_order = ordered.rn
FROM ordered
WHERE v.id = ordered.id;
