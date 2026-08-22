-- =========================================================
-- 日別売上に PayPay 売上を分けて記録する
--
-- 背景: 会場によっては 現金 は venue に集金され、PayPay は自社口座に直接入金
-- されるため、精算時に「現金分の入金」と「PayPay分の入金」を分けて扱う
-- 必要がある。
--
-- 追加カラム:
--  - paypay_amount: その日のPayPay売上(amount と同じ税区分)
--                   デフォルト 0 (=全額現金扱い) で既存レコード互換
--
-- 計算式:
--   総売上   = amount
--   PayPay分 = paypay_amount
--   現金分   = amount - paypay_amount
-- =========================================================

ALTER TABLE event_daily_revenue
  ADD COLUMN IF NOT EXISTS paypay_amount INTEGER NOT NULL DEFAULT 0
    CHECK (paypay_amount >= 0);

COMMENT ON COLUMN event_daily_revenue.paypay_amount IS
  'その日のPayPay売上(amountと同じ税区分)。amount(総売上)に含まれる。amount - paypay_amount = 現金分';

NOTIFY pgrst, 'reload schema';
