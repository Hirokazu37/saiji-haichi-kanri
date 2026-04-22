-- =========================================================
-- Vol29: closing_time カラムを削除
--
-- migration 019 で last_day_closing_time にデータを寄せ、
-- アプリ側のコードも last_day_closing_time のみ参照するように
-- 変更済み。closing_time カラムは完全に不要になったため削除する。
--
-- 実行前確認:
--   アプリがデプロイ済みで last_day_closing_time のみを
--   参照していることを確認してから実行すること。
-- =========================================================

ALTER TABLE events DROP COLUMN IF EXISTS closing_time;
