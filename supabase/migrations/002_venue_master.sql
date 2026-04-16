-- ============================================
-- 百貨店マスター + マネキン紐づけテーブル
-- Supabase SQL Editor で実行してください
-- ============================================

-- 百貨店マスター
CREATE TABLE venue_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_name TEXT NOT NULL,
  store_name TEXT,
  prefecture TEXT,
  sanchoku_code_1 TEXT,
  sanchoku_memo_1 TEXT,
  sanchoku_code_2 TEXT,
  sanchoku_memo_2 TEXT,
  sanchoku_code_3 TEXT,
  sanchoku_memo_3 TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 百貨店-マネキン紐づけ
CREATE TABLE venue_mannequin_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venue_master(id) ON DELETE CASCADE,
  mannequin_agency_id UUID REFERENCES mannequin_agencies(id) ON DELETE CASCADE,
  mannequin_person_id UUID REFERENCES mannequin_people(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLSポリシー
ALTER TABLE venue_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_mannequin_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "認証ユーザーは百貨店マスターを閲覧・編集可能" ON venue_master
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "認証ユーザーは百貨店マネキン紐づけを閲覧・編集可能" ON venue_mannequin_links
  FOR ALL USING (auth.role() = 'authenticated');
