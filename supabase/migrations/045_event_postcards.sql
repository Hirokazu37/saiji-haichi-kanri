-- ============================================================
-- DMはがきの「案内文面（うら面）」
-- ============================================================
-- 催事ごとに、はがきに刷る案内文面を管理する。
-- 宛名面(QR)とは別。ルビは本文側で ｜漢字《かんじ》 形式で保持。
-- ============================================================

CREATE TABLE IF NOT EXISTS event_postcards (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  lead TEXT,           -- 見出し（例: 出店のご案内）
  venue_label TEXT,    -- 百貨店名・店（例: 京阪百貨店 守口店）
  title TEXT,          -- 催事名（例: 四国瀬戸内うまいものめぐり）
  hall TEXT,           -- 会場・階（例: 地下1階 催事場 / 8階 大催事場）
  period_text TEXT,    -- 会期（例: 7月30日(水)〜8月5日(火)）
  hours TEXT,          -- 営業時間（例: 午前10時〜午後8時）
  body TEXT,           -- 本文・ごあいさつ
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE event_postcards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_postcards;
CREATE POLICY "Authenticated users can do everything" ON event_postcards
  FOR ALL USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS set_updated_at ON event_postcards;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON event_postcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
