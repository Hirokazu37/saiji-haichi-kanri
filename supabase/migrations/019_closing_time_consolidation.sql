-- =========================================================
-- Vol29: 閉場時間の統合
-- ユーザー運用上、closing_time に入力していたデータは
-- 実際には「最終日の閉場時間」を意味していたため、
-- last_day_closing_time に寄せる。
--
-- 今後アプリ側は last_day_closing_time のみ参照/更新する。
-- closing_time カラムは互換のため残置（将来削除予定）。
-- =========================================================

UPDATE events
SET last_day_closing_time = closing_time
WHERE last_day_closing_time IS NULL
  AND closing_time IS NOT NULL;
