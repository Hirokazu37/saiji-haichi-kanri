-- ============================================================
-- 催事 × DM区分 のひも付け
-- ============================================================
-- 1つの百貨店に複数の区分（上・地下・お試し等）がある場合、
-- 「この催事のDMはどの区分の名簿に出したか」を催事ごとに記録する。
-- DMハガキ画面で枚数を入力する際に区分を選択する。
-- 来場なし抽出の「この区分の催事だけで判定」が正確になる。
-- ============================================================

CREATE TABLE IF NOT EXISTS event_dm_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kbn_no SMALLINT NOT NULL,
  code SMALLINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, kbn_no, code)
);

CREATE INDEX IF NOT EXISTS idx_event_dm_segments_event ON event_dm_segments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_dm_segments_kbn_code ON event_dm_segments(kbn_no, code);

ALTER TABLE event_dm_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_dm_segments;
CREATE POLICY "Authenticated users can do everything" ON event_dm_segments
  FOR ALL USING (auth.role() = 'authenticated');
