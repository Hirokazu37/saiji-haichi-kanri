-- ============================================================
-- 社員スケジュール差替え時の 催事担当者 自動連動トリガー
-- ============================================================
-- 社員スケジュール (event_staff) で担当者を別の人に差し替えたとき、
-- 催事の担当者 (events.person_in_charge) に旧担当者の名前が
-- 載っていれば、新担当者の名前に自動で書き換える。
--
-- 例: 慶應新宿店の配置を 吉田高雄 → 安岡広和 に差し替えると、
--     催事の担当者欄「吉田高雄」も「安岡広和」に変わる。
--
-- ルール:
--   - event_staff の人物 (person_type / employee_id / mannequin_person_id)
--     が変わった UPDATE のときだけ発動。日付や役割だけの変更では発動しない
--   - 担当者欄に旧担当者の名前が無ければ何もしない
--     (応援スタッフの差替え等、担当者欄と無関係な変更を尊重)
--   - 同じ人の別の配置 (別期間) がまだ残っている場合は名前を消さず、
--     新担当者の名前を追記するだけにする
--   - 担当者欄は「、」区切りの複数名に対応。該当する名前だけを
--     置き換え、自由入力された他の名前はそのまま保持する
--
-- INSERT / DELETE では発動しない (配置の追加・削除は担当者の
-- 交代とは限らないため。必要なら催事詳細ページで手動変更する)。
-- ============================================================

CREATE OR REPLACE FUNCTION sync_person_in_charge_on_staff_swap()
RETURNS TRIGGER AS $$
DECLARE
  old_name TEXT;
  new_name TEXT;
  pic TEXT;
  tokens TEXT[];
  result TEXT[] := '{}';
  t TEXT;
  trimmed TEXT;
  found_old BOOLEAN := false;
  old_still_assigned BOOLEAN;
BEGIN
  -- 人物が変わっていなければ何もしない (日付・役割のみの変更など)
  IF NEW.person_type = OLD.person_type
     AND NEW.employee_id IS NOT DISTINCT FROM OLD.employee_id
     AND NEW.mannequin_person_id IS NOT DISTINCT FROM OLD.mannequin_person_id THEN
    RETURN NEW;
  END IF;

  -- 旧担当者の名前
  IF OLD.person_type = 'employee' THEN
    SELECT name INTO old_name FROM employees WHERE id = OLD.employee_id;
  ELSE
    SELECT name INTO old_name FROM mannequin_people WHERE id = OLD.mannequin_person_id;
  END IF;

  -- 新担当者の名前
  IF NEW.person_type = 'employee' THEN
    SELECT name INTO new_name FROM employees WHERE id = NEW.employee_id;
  ELSE
    SELECT name INTO new_name FROM mannequin_people WHERE id = NEW.mannequin_person_id;
  END IF;

  IF old_name IS NULL OR new_name IS NULL OR old_name = new_name THEN
    RETURN NEW;
  END IF;

  -- 催事の担当者欄を取得
  SELECT person_in_charge INTO pic FROM events WHERE id = NEW.event_id;
  IF pic IS NULL OR btrim(pic) = '' THEN
    RETURN NEW;
  END IF;

  -- 旧担当者の別の配置 (別期間) が同じ催事にまだ残っているか
  SELECT EXISTS (
    SELECT 1 FROM event_staff
    WHERE event_id = NEW.event_id
      AND id <> NEW.id
      AND person_type = OLD.person_type
      AND employee_id IS NOT DISTINCT FROM OLD.employee_id
      AND mannequin_person_id IS NOT DISTINCT FROM OLD.mannequin_person_id
  ) INTO old_still_assigned;

  -- 担当者欄を「、」「,」で分割し、旧担当者名を処理する
  tokens := regexp_split_to_array(pic, '[、,]');
  FOREACH t IN ARRAY tokens LOOP
    trimmed := btrim(t);
    IF trimmed = '' THEN
      CONTINUE;
    END IF;
    IF trimmed = old_name THEN
      found_old := true;
      -- 別の配置が残っていれば旧担当者名は残す (残っていなければ除去)
      IF old_still_assigned AND NOT (trimmed = ANY(result)) THEN
        result := array_append(result, trimmed);
      END IF;
    ELSIF NOT (trimmed = ANY(result)) THEN
      result := array_append(result, trimmed);
    END IF;
  END LOOP;

  -- 担当者欄に旧担当者が載っていなければ何もしない
  IF NOT found_old THEN
    RETURN NEW;
  END IF;

  -- 新担当者名を追加 (重複は避ける)
  IF NOT (new_name = ANY(result)) THEN
    result := array_append(result, new_name);
  END IF;

  UPDATE events
  SET person_in_charge = NULLIF(array_to_string(result, '、'), '')
  WHERE id = NEW.event_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 既存のトリガーがあれば再作成 (idempotent)
DROP TRIGGER IF EXISTS trg_sync_person_in_charge ON event_staff;

CREATE TRIGGER trg_sync_person_in_charge
  AFTER UPDATE OF person_type, employee_id, mannequin_person_id ON event_staff
  FOR EACH ROW
  EXECUTE FUNCTION sync_person_in_charge_on_staff_swap();

COMMENT ON FUNCTION sync_person_in_charge_on_staff_swap() IS
  '社員スケジュールで担当者を差し替えたとき、催事の担当者欄 (events.person_in_charge) の名前も連動して書き換える';
