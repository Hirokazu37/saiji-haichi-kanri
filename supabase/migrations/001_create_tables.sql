-- ============================================
-- 催事手配管理システム DBスキーマ
-- Supabase SQL Editor で実行してください
-- ============================================

-- 社員マスター
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 催事
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  prefecture TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  person_in_charge TEXT,
  status TEXT NOT NULL DEFAULT '準備中',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ホテル手配
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  hotel_name TEXT,
  address TEXT,
  check_in_date DATE,
  check_out_date DATE,
  room_count INTEGER,
  guest_count INTEGER,
  price_per_night INTEGER,
  reservation_number TEXT,
  reservation_status TEXT DEFAULT '未予約',
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 交通手配
CREATE TABLE transportations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  transport_type TEXT,
  departure_from TEXT,
  arrival_to TEXT,
  outbound_datetime TIMESTAMPTZ,
  return_datetime TIMESTAMPTZ,
  passenger_count INTEGER,
  price_per_person INTEGER,
  reservation_number TEXT,
  reservation_status TEXT DEFAULT '未予約',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- マネキン手配
CREATE TABLE mannequins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  agency_name TEXT,
  staff_name TEXT,
  work_start_date DATE,
  work_end_date DATE,
  work_hours TEXT,
  daily_rate INTEGER,
  phone TEXT,
  arrangement_status TEXT DEFAULT '未手配',
  skills TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 社員配置
CREATE TABLE event_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  role TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 備品転送
CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_phone TEXT,
  ship_date DATE NOT NULL,
  arrival_date DATE,
  carrier TEXT,
  tracking_number TEXT,
  shipment_status TEXT DEFAULT '未発送',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- RLS（行レベルセキュリティ）ポリシー
-- 認証済みユーザーのみ全操作可能
-- ============================================

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE transportations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mannequins ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーに全権限を付与
CREATE POLICY "Authenticated users can do everything" ON employees FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON events FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON hotels FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON transportations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON mannequins FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON event_staff FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can do everything" ON shipments FOR ALL USING (auth.role() = 'authenticated');

-- ============================================
-- updated_at 自動更新トリガー
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON hotels FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON transportations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON mannequins FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON event_staff FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
