-- ============================================================
-- 催事ごとのDM名簿（DM送付先）
-- ============================================================
-- 産直くんで区分抽出した「この催事のDM名簿」CSVを、DMハガキ一覧から
-- 催事ごとに取り込む。名簿が催事に直接ひも付くため、
--   ・区分の重複（1百貨店複数区分、複写登録の別番号顧客）に左右されない
--   ・名簿人数に対する正確な反応率が出せる
--   ・来場登録時に「この催事の名簿に載っているか」を照合できる
-- ============================================================

CREATE TABLE IF NOT EXISTS event_dm_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_event_dm_recipients_event ON event_dm_recipients(event_id);
CREATE INDEX IF NOT EXISTS idx_event_dm_recipients_customer ON event_dm_recipients(customer_id);

ALTER TABLE event_dm_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_dm_recipients;
CREATE POLICY "Authenticated users can do everything" ON event_dm_recipients
  FOR ALL USING (auth.role() = 'authenticated');

-- 取込履歴にも催事を記録できるようにする
ALTER TABLE customer_import_logs
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
