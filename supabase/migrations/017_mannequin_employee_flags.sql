-- =========================================================
-- Vol29: マネキン個人に2つのフラグを追加
--   - treat_as_employee: 社員のように扱う(event_staffで配置・社員スケジュール表に登場)
--   - travel_available : 出張可能(遠方催事の候補抽出用)
--
-- 社員扱いON  → event_staff のみで運用（マネキンタブには出さない）
-- 社員扱いOFF → 従来通り mannequins テーブルで運用
-- =========================================================

ALTER TABLE mannequin_people
  ADD COLUMN IF NOT EXISTS treat_as_employee BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS travel_available  BOOLEAN NOT NULL DEFAULT false;

-- 絞り込み/フィルタ用インデックス
CREATE INDEX IF NOT EXISTS idx_mannequin_people_treat_as_employee
  ON mannequin_people(treat_as_employee) WHERE treat_as_employee = true;

CREATE INDEX IF NOT EXISTS idx_mannequin_people_travel_available
  ON mannequin_people(travel_available) WHERE travel_available = true;
