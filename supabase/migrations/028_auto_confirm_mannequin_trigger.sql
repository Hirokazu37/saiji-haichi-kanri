-- ============================================================
-- マネキン割当て時の 自動「確定」トリガー
-- ============================================================
-- 日程表でマネキンを 1 名でも割当てた瞬間に、
-- 催事の mannequin_arrangement_status を自動的に '確定' に切り替える。
--
-- ルール:
--   - person_type = 'mannequin' で INSERT された場合のみ発動
--   - その催事の status が NULL または '未手配' のときだけ '確定' に更新
--   - 既に '確定' / '完了' のときは触らない (ユーザーの明示的な状態を尊重)
--
-- DELETE では発動しない (1名外しても残メンバーで手配継続している可能性が高い)。
-- 必要なら手動でステータスを変更してもらう。
-- ============================================================

CREATE OR REPLACE FUNCTION auto_confirm_mannequin_arrangement()
RETURNS TRIGGER AS $$
BEGIN
  -- マネキン以外 (社員) の追加は対象外
  IF NEW.person_type <> 'mannequin' THEN
    RETURN NEW;
  END IF;

  -- 該当催事のステータスが NULL または '未手配' のときだけ '確定' に書き換える。
  -- '確定' / '完了' は触らない。
  UPDATE events
  SET mannequin_arrangement_status = '確定'
  WHERE id = NEW.event_id
    AND (
      mannequin_arrangement_status IS NULL
      OR mannequin_arrangement_status = '未手配'
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 既存のトリガーがあれば再作成 (idempotent)
DROP TRIGGER IF EXISTS trg_auto_confirm_mannequin ON event_staff;

CREATE TRIGGER trg_auto_confirm_mannequin
  AFTER INSERT ON event_staff
  FOR EACH ROW
  EXECUTE FUNCTION auto_confirm_mannequin_arrangement();

COMMENT ON FUNCTION auto_confirm_mannequin_arrangement() IS
  'event_staff にマネキンが追加されたら、該当催事の mannequin_arrangement_status を自動で 確定 にする (NULL/未手配 のときのみ)';
