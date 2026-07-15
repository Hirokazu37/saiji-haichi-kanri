-- 商品出荷帳面：手書きの出荷帳面（ランクA〜F別の標準出荷数）をデジタル化する。
-- ・shipment_products      … 商品マスター（増減できる）
-- ・shipment_standards     … ランク(A〜F)×商品の標準数量（数量は "15K" "45×4" 等もあるためTEXT）
-- ・event_shipment_sheets  … 催事ごとの出荷帳面（便＝初回/追加… は jsonb）

CREATE TABLE IF NOT EXISTS shipment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  spec TEXT NOT NULL DEFAULT '',      -- 規格（10枚入/5枚入/大/小/2入 など）
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (name, spec)
);

CREATE TABLE IF NOT EXISTS shipment_standards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_key TEXT NOT NULL,             -- 'A'〜'F'
  product_id UUID NOT NULL REFERENCES shipment_products(id) ON DELETE CASCADE,
  qty TEXT NOT NULL DEFAULT '',
  UNIQUE (rank_key, product_id)
);

CREATE TABLE IF NOT EXISTS event_shipment_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  rank_key TEXT,
  shipments JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{label, date, memo, items:{productId: qty}}]
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shipment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_shipment_sheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "認証ユーザーは商品マスターを操作可能" ON shipment_products;
CREATE POLICY "認証ユーザーは商品マスターを操作可能" ON shipment_products
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "認証ユーザーは標準数量を操作可能" ON shipment_standards;
CREATE POLICY "認証ユーザーは標準数量を操作可能" ON shipment_standards
  FOR ALL USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "認証ユーザーは出荷帳面を操作可能" ON event_shipment_sheets;
CREATE POLICY "認証ユーザーは出荷帳面を操作可能" ON event_shipment_sheets
  FOR ALL USING (auth.role() = 'authenticated');

-- ===== 初期データ（手書き帳面から読み取り。マスター画面で修正可能） =====
INSERT INTO shipment_products (name, spec, sort_order) VALUES
  ('宇和島じゃこ天', '10枚入', 1),
  ('宇和島じゃこ天', '5枚入', 2),
  ('やさい天', '', 3),
  ('身天', '', 4),
  ('玉ねぎ天', '', 5),
  ('ゴボ天', '', 6),
  ('じゃこカツ', '3入', 7),
  ('ハランボじゃこ天', '', 8),
  ('つまみ天', 'A', 9),
  ('つまみ天', 'B', 10),
  ('つみれ', '', 11),
  ('上板', '', 12),
  ('あげ巻', '大', 13),
  ('あげ巻', '小', 14),
  ('じゃこちくわ', '2入', 15),
  ('じゃこちくわ', '5入', 16),
  ('えぞちくわ', '3入', 17),
  ('チーズちくわ', '', 18),
  ('ちゃんぽんの具', '', 19)
ON CONFLICT (name, spec) DO NOTHING;

WITH s(name, spec, qa, qb, qc, qd, qe, qf) AS (
  VALUES
  ('宇和島じゃこ天','10枚入','30','30','30','30','20','20'),
  ('宇和島じゃこ天','5枚入','140','140','100','90','60','40'),
  ('やさい天','','150','130','100','100','60','50'),
  ('身天','','200','200','120','100','80','50'),
  ('玉ねぎ天','','200','200','120','100','80','50'),
  ('ゴボ天','','200','200','100','100','80','50'),
  ('じゃこカツ','3入','30','30','30','30','30','20'),
  ('ハランボじゃこ天','','300','300','230','200','80','60'),
  ('つまみ天','A','15K','10K','6K','5K','5K',''),
  ('つまみ天','B','15K','10K','4K','3K','',''),
  ('つみれ','','45×4','45×4','45×2','45×2','60','60'),
  ('上板','','40/40','25/25','20/20','15/15','10/10','5/5'),
  ('あげ巻','大','60','50','20','20','10','10'),
  ('あげ巻','小','120','100','50','40','20','20'),
  ('じゃこちくわ','2入','60','40','40','40','20','20'),
  ('じゃこちくわ','5入','20','20','20','20','10','5'),
  ('えぞちくわ','3入','70','60','30','30','20','15'),
  ('チーズちくわ','','60','50','30','30','20','20'),
  ('ちゃんぽんの具','','30','20','20','20','10','5')
),
expanded AS (
  SELECT s.name, s.spec, r.rank_key, r.qty
  FROM s, LATERAL (VALUES ('A', s.qa), ('B', s.qb), ('C', s.qc), ('D', s.qd), ('E', s.qe), ('F', s.qf)) AS r(rank_key, qty)
)
INSERT INTO shipment_standards (rank_key, product_id, qty)
SELECT e.rank_key, p.id, e.qty
FROM expanded e
JOIN shipment_products p ON p.name = e.name AND p.spec = e.spec
ON CONFLICT (rank_key, product_id) DO UPDATE SET qty = EXCLUDED.qty;
