-- 日別売上に税区分と税率を追加
-- tax_type: amount が税抜価格(excluded)か税込価格(included)かを示す
-- tax_rate: 消費税率（デフォルト0.08 = 軽減税率8%、酒類等は0.10）
ALTER TABLE event_daily_revenue
  ADD COLUMN IF NOT EXISTS tax_type TEXT NOT NULL DEFAULT 'excluded'
    CHECK (tax_type IN ('excluded', 'included')),
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(4,3) NOT NULL DEFAULT 0.08;
