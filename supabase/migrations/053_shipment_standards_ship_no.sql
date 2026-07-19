-- 標準数量を「便ごと」（1=初回, 2=追加1, 3=追加2）に持てるようにする。
-- 手書き帳面の各ランクページにあった複数ブロック（初回＋追加出荷）に対応。
-- 既存データは ship_no=1（初回）として扱われる。

ALTER TABLE shipment_standards ADD COLUMN IF NOT EXISTS ship_no INT NOT NULL DEFAULT 1;

ALTER TABLE shipment_standards DROP CONSTRAINT IF EXISTS shipment_standards_rank_key_product_id_key;

DO $$ BEGIN
  ALTER TABLE shipment_standards
    ADD CONSTRAINT shipment_standards_rank_product_ship_key UNIQUE (rank_key, product_id, ship_no);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
