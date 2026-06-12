-- ============================================================
-- 顧客マスタ + 来場記録 (DM丸付けのデジタル化)
-- ============================================================
-- 顧客管理の本体は産直くん11。本アプリは
--   1. 産直くんからCSVで取り込んだ顧客のコピー (customers)
--   2. 顧客が属するDM区分 (customer_segments → sanchoku_segments と疎結合)
--   3. 催事ごとの来場記録 = 従来の「丸付け」 (event_visits)
-- を持つ。DM送付フラグの更新は抽出CSVを産直くん側で一括取込して行う。
-- ============================================================

-- 顧客マスタ (産直くん得意先のコピー)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_no TEXT NOT NULL UNIQUE,    -- 産直くんの得意先コード (先頭ゼロ保持のためTEXT)
  name TEXT NOT NULL,
  kana TEXT,
  postal_code TEXT,
  address TEXT,
  phone TEXT,
  dm_active BOOLEAN NOT NULL DEFAULT true,  -- DM送付対象 (産直くん側フラグの写し)
  notes TEXT,
  imported_at TIMESTAMPTZ,             -- 最終CSV取込日時
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_customer_no ON customers(customer_no);
CREATE INDEX IF NOT EXISTS idx_customers_kana ON customers(kana);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

-- 顧客 × DM区分 (汎用マスター区分 3〜10)
-- sanchoku_segments(kbn_no, code) と名前で結合する疎結合 (取込CSVに
-- 未登録区分が含まれてもエラーにしないため FK は張らない)
CREATE TABLE IF NOT EXISTS customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  kbn_no SMALLINT NOT NULL,
  code SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (customer_id, kbn_no)         -- 1顧客につき各区分番号は1コード
);

CREATE INDEX IF NOT EXISTS idx_customer_segments_customer ON customer_segments(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_segments_kbn_code ON customer_segments(kbn_no, code);

-- 来場記録 (= 丸付け)。DMを持参・提示した人を催事ごとに記録する
CREATE TABLE IF NOT EXISTS event_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  visited_on DATE,                     -- 来場日 (不明ならNULL、催事期間で代用)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, customer_id)       -- 同一催事への重複登録を防ぐ
);

CREATE INDEX IF NOT EXISTS idx_event_visits_event ON event_visits(event_id);
CREATE INDEX IF NOT EXISTS idx_event_visits_customer ON event_visits(customer_id);

-- RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON customers;
CREATE POLICY "Authenticated users can do everything" ON customers
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can do everything" ON customer_segments;
CREATE POLICY "Authenticated users can do everything" ON customer_segments
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_visits;
CREATE POLICY "Authenticated users can do everything" ON event_visits
  FOR ALL USING (auth.role() = 'authenticated');

-- updated_at 自動更新
DROP TRIGGER IF EXISTS set_updated_at ON customers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
