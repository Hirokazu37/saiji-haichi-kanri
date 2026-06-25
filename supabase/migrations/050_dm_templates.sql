-- ============================================================
-- 百貨店ごとのDM文面テンプレート（体裁＋記載ルール/癖メモ）
-- ============================================================
-- 横浜高島屋などで整えた文面レイアウトを「その百貨店の標準」として保存し、
-- 同じ会場・店の新しい催事では自動でこの体裁＋メモを適用する（学習・精度向上）。
-- venue_key = `${venue}|${store_name ?? ''}`
-- ============================================================

CREATE TABLE IF NOT EXISTS dm_templates (
  venue_key TEXT PRIMARY KEY,
  venue TEXT NOT NULL,
  store_name TEXT,
  blocks JSONB,                 -- 文面ブロックの並び（体裁の雛形）
  note TEXT,                    -- 百貨店ごとの癖・注意（会場/期間の書き方など）
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE dm_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do everything" ON dm_templates;
CREATE POLICY "Authenticated users can do everything" ON dm_templates
  FOR ALL USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS set_updated_at ON dm_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON dm_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
