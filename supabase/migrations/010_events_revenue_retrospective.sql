-- ============================================
-- 催事の実績記録フィールドを追加
-- - revenue: 売上金額（円、任意）
-- - retrospective: 振り返りメモ（任意）
-- 終了した催事の実績を後から記録できるようにする
-- Supabase SQL Editor で実行してください
-- ============================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS revenue INTEGER,
  ADD COLUMN IF NOT EXISTS retrospective TEXT;
