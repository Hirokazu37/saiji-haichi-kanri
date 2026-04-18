-- 社員配置(event_staff)にマネキン人物を入れられるよう拡張
-- person_type で種別を管理し、employee_id / mannequin_person_id を排他で格納する

ALTER TABLE event_staff
  ALTER COLUMN employee_id DROP NOT NULL,
  ADD COLUMN person_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (person_type IN ('employee','mannequin')),
  ADD COLUMN mannequin_person_id UUID REFERENCES mannequin_people(id) ON DELETE CASCADE,
  ADD CONSTRAINT event_staff_person_check CHECK (
    (person_type = 'employee' AND employee_id IS NOT NULL AND mannequin_person_id IS NULL)
    OR
    (person_type = 'mannequin' AND mannequin_person_id IS NOT NULL AND employee_id IS NULL)
  );
