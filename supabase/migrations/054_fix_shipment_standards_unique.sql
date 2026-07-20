-- 053 の一意制約が作られなかった場合の修復。
-- 症状: 追加1/追加2 の保存時に
--   「there is no unique or exclusion constraint matching the ON CONFLICT specification」
-- 原因: (rank_key, product_id) の旧一意制約が名前違いで残っている／
--       (rank_key, product_id, ship_no) の一意制約が未作成。
-- 制約名に依存せず、実体（対象列）で判定して張り替える。

-- 1) ship_no を整える（無ければ追加し、NULLは1に寄せる）
ALTER TABLE shipment_standards ADD COLUMN IF NOT EXISTS ship_no INT;
UPDATE shipment_standards SET ship_no = 1 WHERE ship_no IS NULL;
ALTER TABLE shipment_standards ALTER COLUMN ship_no SET DEFAULT 1;
ALTER TABLE shipment_standards ALTER COLUMN ship_no SET NOT NULL;

-- 2) (rank_key, product_id) だけの一意制約/インデックスを名前に関係なく削除
--    （これが残っていると 1商品につき1行しか持てず、追加便を保存できない）
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'shipment_standards'::regclass
      AND c.contype = 'u'
      -- attname は name 型のため text にキャストして比較する
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
      ) = ARRAY['product_id','rank_key']::text[]
  LOOP
    EXECUTE format('ALTER TABLE shipment_standards DROP CONSTRAINT %I', r.conname);
  END LOOP;

  FOR r IN
    SELECT i.indexname
    FROM pg_indexes i
    WHERE i.tablename = 'shipment_standards'
      AND i.indexdef ILIKE '%UNIQUE%'
      AND i.indexdef ILIKE '%(rank_key, product_id)%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I', r.indexname);
  END LOOP;
END $$;

-- 3) 重複行があると一意インデックスを張れないので、先に1件へ整理
DELETE FROM shipment_standards a
USING shipment_standards b
WHERE a.ctid < b.ctid
  AND a.rank_key = b.rank_key
  AND a.product_id = b.product_id
  AND a.ship_no = b.ship_no;

-- 4) 目的の一意インデックスを作成（ON CONFLICT はこの索引で解決される）
CREATE UNIQUE INDEX IF NOT EXISTS shipment_standards_rank_product_ship_uidx
  ON shipment_standards (rank_key, product_id, ship_no);
