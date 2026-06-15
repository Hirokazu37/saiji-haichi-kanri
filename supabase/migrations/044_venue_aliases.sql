-- ============================================================
-- 百貨店マスターの別表記（名寄せ）
-- ============================================================
-- 催事は会場名(events.venue + store_name)の文字列で百貨店マスターに
-- 紐づくため、過去の催事で表記がゆれていると店舗カルテの集計から漏れる。
-- 別表記を登録しておくと、その会場名の催事もこの店の実績として集計される。
-- ============================================================

CREATE TABLE IF NOT EXISTS venue_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venue_master(id) ON DELETE CASCADE,
  alias_venue TEXT NOT NULL,       -- events.venue と突き合わせる会場名
  alias_store TEXT,                -- events.store_name と突き合わせる店舗名（無ければNULL）
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (alias_venue, alias_store)
);

CREATE INDEX IF NOT EXISTS idx_venue_aliases_venue ON venue_aliases(venue_id);

ALTER TABLE venue_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON venue_aliases;
CREATE POLICY "Authenticated users can do everything" ON venue_aliases
  FOR ALL USING (auth.role() = 'authenticated');
