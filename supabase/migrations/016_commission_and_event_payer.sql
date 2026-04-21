-- =========================================================
-- Vol28: 入金管理拡張
-- 1. events に入金元オーバーライド（force_direct / payer_master_id）
-- 2. venue_master に直取引・帳合の入金率（手数料率の対）
-- 3. event_payments に適用率を記録
-- =========================================================

-- 1. events に催事単位の入金元設定
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS payer_master_id UUID REFERENCES payer_master(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS force_direct BOOLEAN NOT NULL DEFAULT false;

-- 2. venue_master に直取引率・帳合経由率（入金比率%）
-- 直取引率 80% = 税抜売上の80%が入金される
ALTER TABLE venue_master
  ADD COLUMN IF NOT EXISTS direct_receive_rate NUMERIC(5,2)
    CHECK (direct_receive_rate IS NULL OR (direct_receive_rate BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS chouai_receive_rate NUMERIC(5,2)
    CHECK (chouai_receive_rate IS NULL OR (chouai_receive_rate BETWEEN 0 AND 100));

-- 3. event_payments に適用した入金率を記録（後から「売上からコピー」で使う）
ALTER TABLE event_payments
  ADD COLUMN IF NOT EXISTS applied_rate NUMERIC(5,2)
    CHECK (applied_rate IS NULL OR (applied_rate BETWEEN 0 AND 100));
