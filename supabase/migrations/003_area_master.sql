-- ============================================
-- エリアマスター + hotel_master/venue_master にarea_id追加
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. エリアマスター テーブル作成
CREATE TABLE area_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE area_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON area_master
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 2. hotel_master に area_id カラム追加
ALTER TABLE hotel_master ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES area_master(id) ON DELETE SET NULL;

-- 3. venue_master に area_id カラム追加
ALTER TABLE venue_master ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES area_master(id) ON DELETE SET NULL;

-- 4. 既存 area_memo データを area_master に移行
INSERT INTO area_master (name, sort_order)
SELECT DISTINCT TRIM(area_memo), ROW_NUMBER() OVER (ORDER BY TRIM(area_memo)) - 1
FROM hotel_master
WHERE area_memo IS NOT NULL AND TRIM(area_memo) <> ''
ON CONFLICT (name) DO NOTHING;

-- 5. hotel_master.area_id をバックフィル
UPDATE hotel_master h
SET area_id = a.id
FROM area_master a
WHERE h.area_memo IS NOT NULL AND TRIM(h.area_memo) = a.name;
