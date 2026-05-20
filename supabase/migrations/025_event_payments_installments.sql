-- 締日跨ぎ催事の入金分割対応
-- 例: 20日締めの百貨店で 4/18〜4/25 開催
--   → 4/18-4/20 (1回目, 5/15 入金)
--   → 4/21-4/25 (2回目, 6/15 入金)
-- それぞれ event_payments の別行として保存し、期間と回数を記録する

ALTER TABLE event_payments
  ADD COLUMN IF NOT EXISTS period_start_date DATE,
  ADD COLUMN IF NOT EXISTS period_end_date DATE,
  ADD COLUMN IF NOT EXISTS installment_no SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS installment_total SMALLINT NOT NULL DEFAULT 1;

-- インデックス: 同じ催事の installment_no 順アクセス用
CREATE INDEX IF NOT EXISTS idx_event_payments_event_installment
  ON event_payments(event_id, installment_no);

NOTIFY pgrst, 'reload schema';
