-- ============================================================
-- 過去催事売上 (legacy_sales) テーブル
-- ============================================================
-- 「催事販売数」フォルダの Excel (会場ごと1ファイル × シートごと1催事、
-- 2005年〜) から抽出した過去の催事売上。AI解説などの参考データとして使う。
--
-- - venue_name は元ファイル名そのまま (例: 京王百貨店)。
--   百貨店マスターとの厳密な紐付けはせず、利用側で名前マッチする
-- - total_sales の税区分は tax_type (excluded/included/NULL=不明)
-- - 既存の events / event_daily_revenue とは独立 (日程表には出ない)
-- ============================================================

CREATE TABLE IF NOT EXISTS legacy_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name TEXT NOT NULL,        -- 会場名 (元ファイル名)
  event_name TEXT NOT NULL,        -- 催事名 (元シート名)
  year SMALLINT NOT NULL,          -- 開催年
  start_date DATE,                 -- 初日 (取得できた場合)
  end_date DATE,                   -- 最終日 (取得できた場合)
  days SMALLINT,                   -- 売上が記録された日数
  total_sales INTEGER NOT NULL,    -- 総売上 (円)
  tax_type TEXT CHECK (tax_type IN ('included', 'excluded')),  -- NULL = 記録なし
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (venue_name, event_name)
);

CREATE INDEX IF NOT EXISTS idx_legacy_sales_venue ON legacy_sales(venue_name);
CREATE INDEX IF NOT EXISTS idx_legacy_sales_year ON legacy_sales(year);

ALTER TABLE legacy_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "認証ユーザーは過去売上を閲覧・編集可能" ON legacy_sales;
CREATE POLICY "認証ユーザーは過去売上を閲覧・編集可能" ON legacy_sales
  FOR ALL USING (auth.role() = 'authenticated');
