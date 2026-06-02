-- ============================================================
-- 既存マネキン手配の バックフィル
-- ============================================================
-- 026 で events.mannequin_arrangement_status を追加した時点では、
-- 既にマネキンが event_staff に割当てられている催事も「未設定」(NULL) のまま。
-- このマイグレーションで、既存の手配済みデータを「確定」に一括反映する。
--
-- 「確定」を選んだ理由:
--   - マネキンが割当てられている = 既に依頼を出して合意済 という解釈
--   - 完了かどうかは催事終了後の確認次第なので、ユーザーが個別に切り替え
-- ============================================================

UPDATE events
SET mannequin_arrangement_status = '確定'
WHERE id IN (
  SELECT DISTINCT event_id
  FROM event_staff
  WHERE person_type = 'mannequin'
)
AND mannequin_arrangement_status IS NULL;
