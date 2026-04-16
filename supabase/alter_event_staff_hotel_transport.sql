-- event_staffにホテル・交通情報を追加（社員ごとに紐づけ）
-- Supabase SQL Editorで実行してください

ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS hotel_check_in DATE;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS hotel_check_out DATE;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS hotel_master_id UUID REFERENCES hotel_master(id);
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS transport_type TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS transport_from TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS transport_to TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS transport_datetime TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS transport_status TEXT DEFAULT '未予約';
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS hotel_status TEXT DEFAULT '未予約';
