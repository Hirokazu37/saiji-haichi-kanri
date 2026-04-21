-- 最終日の閉場時間（通常の閉場時間より早く閉まる催事に対応）
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_day_closing_time TEXT;

-- 日別売上テーブル（催事の会期ごとに1日単位で記録）
CREATE TABLE IF NOT EXISTS event_daily_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, date)
);

CREATE INDEX IF NOT EXISTS idx_event_daily_revenue_event ON event_daily_revenue(event_id);

ALTER TABLE event_daily_revenue ENABLE ROW LEVEL SECURITY;

-- 閲覧: 認証ユーザーは全件参照可
CREATE POLICY "Authenticated can read daily revenue"
  ON event_daily_revenue FOR SELECT TO authenticated USING (true);

-- 書き込み: 編集権限持ちのみ
CREATE POLICY "Editors can insert daily revenue"
  ON event_daily_revenue FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update daily revenue"
  ON event_daily_revenue FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete daily revenue"
  ON event_daily_revenue FOR DELETE TO authenticated
  USING (public.current_user_can_edit());
