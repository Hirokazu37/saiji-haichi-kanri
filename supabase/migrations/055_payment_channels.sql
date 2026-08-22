-- =========================================================
-- 催事の複数支払方法対応 (現金 / PayPay 等)
--
-- 背景: みどり会などのイベントで、自社持込決済端末 (PayPay等) の売上は
-- venue経由ではなく自社口座に直接入金される。従来の event_payments は
-- 「1催事 = 1入金経路」を前提としていたため分離できなかった。
--
-- 追加カラム:
--  - channel:         決済チャネル (現金 / PayPay / クレジット / その他)
--                     NULL は従来の一括入金として扱う（既存レコード互換）
--  - is_self_receive: true なら自社口座に直接入金 (venue経由でない)
--                     PayPay 等の自社端末売上
--  - fee_rate:        決済手数料率 (%) — PayPay 3.24 など
--                     applied_rate (venue の入金比率) とは別で、支払方法自体の
--                     手数料
--
-- 使い方:
--   1件の催事に channel 別に複数行を作れる
--   例: [現金分] venue_master_id=みどり会, applied_rate=80
--       [PayPay分] payer_master_id=NULL, is_self_receive=true, fee_rate=3.24
-- =========================================================

ALTER TABLE event_payments
  ADD COLUMN IF NOT EXISTS channel TEXT
    CHECK (channel IS NULL OR channel IN ('現金', 'PayPay', 'クレジット', 'その他')),
  ADD COLUMN IF NOT EXISTS is_self_receive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_rate NUMERIC(5,3)
    CHECK (fee_rate IS NULL OR (fee_rate BETWEEN 0 AND 100));

COMMENT ON COLUMN event_payments.channel IS
  '決済チャネル（現金/PayPay/クレジット/その他）。NULLは従来の一括入金';
COMMENT ON COLUMN event_payments.is_self_receive IS
  'trueなら自社口座に直接入金(venue経由でない)。PayPay 等の自社端末売上';
COMMENT ON COLUMN event_payments.fee_rate IS
  '決済手数料率(%)。PayPay 3.24 等。applied_rate(venueからの入金比率)とは別';

-- venue や payer が両方 NULL で is_self_receive=true の場合を許可する制約緩和
-- (既存の event_payments_payer_xor は「両方 NULL は OK」なので追加変更なし)

NOTIFY pgrst, 'reload schema';
