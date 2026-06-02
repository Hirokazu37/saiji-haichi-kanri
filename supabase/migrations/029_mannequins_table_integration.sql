-- ============================================================
-- マネキン手配ステータス: mannequins テーブルからも自動反映
-- ============================================================
-- 027 のバックフィルと 028 のトリガーは event_staff (個人割当て) しか
-- 見ていなかったが、実際の手配は mannequins テーブル (会社+人数枠を含む)
-- にも記録されている。両方を対象にする。
--
-- このマイグレーションでやること:
--   ① 027 のバックフィルを mannequins 経由でも実行 (取りこぼし救済)
--   ② mannequins への INSERT で同じ「確定」自動反映トリガーを追加
-- ============================================================

-- ① バックフィル: mannequins に行がある催事も '確定' に
UPDATE events
SET mannequin_arrangement_status = '確定'
WHERE id IN (
  SELECT DISTINCT event_id FROM mannequins
)
AND mannequin_arrangement_status IS NULL;

-- ② mannequins 用の自動確定トリガー
CREATE OR REPLACE FUNCTION auto_confirm_mannequin_arrangement_from_mannequins()
RETURNS TRIGGER AS $$
BEGIN
  -- 該当催事のステータスが NULL または '未手配' のときだけ '確定' に書き換える。
  -- '確定' / '完了' は触らない (ユーザーの明示的な状態を尊重)。
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

DROP TRIGGER IF EXISTS trg_auto_confirm_mannequin_from_mannequins ON mannequins;

CREATE TRIGGER trg_auto_confirm_mannequin_from_mannequins
  AFTER INSERT ON mannequins
  FOR EACH ROW
  EXECUTE FUNCTION auto_confirm_mannequin_arrangement_from_mannequins();

COMMENT ON FUNCTION auto_confirm_mannequin_arrangement_from_mannequins() IS
  'mannequins (会社+人数枠を含む手配) が追加されたら、該当催事の mannequin_arrangement_status を 確定 にする (NULL/未手配 のときのみ)';
