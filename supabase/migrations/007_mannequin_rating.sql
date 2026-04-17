-- ============================================
-- マネキンさんに5段階★評価を追加＋既存evaluationをnotesに移行
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. rating カラム追加（0=未評価、1-5）
ALTER TABLE mannequin_people
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating >= 0 AND rating <= 5);

-- 2. 既存 evaluation テキストを notes に追記（データが入っているレコードのみ）
UPDATE mannequin_people
SET notes = CASE
  WHEN notes IS NULL OR notes = '' THEN '【過去の評価】' || evaluation
  ELSE notes || E'\n\n【過去の評価】' || evaluation
END
WHERE evaluation IS NOT NULL AND evaluation <> '';

-- 3. evaluation をクリア（カラム自体は互換のため残す）
UPDATE mannequin_people
SET evaluation = NULL
WHERE evaluation IS NOT NULL;
