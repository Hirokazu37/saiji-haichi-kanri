-- ============================================
-- events.name を NULL 許容に変更
-- 催事名を未記入のまま登録できるようにし、
-- あとから詳細ページで追記できる運用にする。
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. NOT NULL 制約を外す
ALTER TABLE events
  ALTER COLUMN name DROP NOT NULL;

-- 2. Vol8 で「百貨店名 + 店舗名」で自動補完されていた催事名を NULL に戻す
--    （ユーザーが実際に入力した催事名は残す）
UPDATE events
SET name = NULL
WHERE name IS NOT NULL
  AND name = CASE
    WHEN store_name IS NOT NULL AND store_name <> ''
      THEN venue || ' ' || store_name
    ELSE venue
  END;
