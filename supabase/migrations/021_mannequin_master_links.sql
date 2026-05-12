-- マネキン手配にマスター紐づけと人数列を追加し、4つの行パターンを表現可能にする:
--   ①マスター個人        mannequin_person_id 埋まる, headcount=1
--   ②マスター会社+人数枠  mannequin_agency_id 埋まる, headcount>=1, mannequin_person_id=null
--   ③自由入力 個人        FK両方null, staff_name 自由
--   ④自由入力 会社+人数枠 FK両方null, staff_name=null, agency_name 自由, headcount>=1

ALTER TABLE mannequins
  ADD COLUMN IF NOT EXISTS mannequin_person_id UUID REFERENCES mannequin_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mannequin_agency_id UUID REFERENCES mannequin_agencies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS headcount INTEGER NOT NULL DEFAULT 1;

-- 既存の staff_name = "○名" 形式（例: "2名", "3 名"）を headcount に自動移行
UPDATE mannequins
SET
  headcount = (regexp_match(staff_name, '^([0-9]+)\s*名$'))[1]::INTEGER,
  staff_name = NULL
WHERE staff_name ~ '^[0-9]+\s*名$';

-- PostgREST のスキーマキャッシュ即時リロード
NOTIFY pgrst, 'reload schema';
