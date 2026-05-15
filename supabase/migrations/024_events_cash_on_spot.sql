-- 催事ごとに「現金持ち帰り」フラグを追加。
-- 1〜2日の臨時イベントなど、その場で現金として売上を受領するケース用。
-- フラグONの催事は売上保存時に自動で event_payments を「現金受領済」状態にする。

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS is_cash_on_spot BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
