-- =========================================================
-- Vol28: 催事売上の入金管理
-- 1. user_profiles に経理閲覧権限フラグ追加
-- 2. 帳合先マスター payer_master 作成
-- 3. venue_master に振込サイクル＋デフォルト帳合先 追加
-- 4. event_payments テーブル作成
-- =========================================================

-- 1. ユーザーに経理閲覧フラグ追加
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS can_view_payments BOOLEAN NOT NULL DEFAULT false;

-- admin ロールのユーザーは自動で経理閲覧を ON にする
UPDATE user_profiles SET can_view_payments = true WHERE role = 'admin';

-- 経理閲覧権限チェック用の SQL 関数
CREATE OR REPLACE FUNCTION public.current_user_can_view_payments()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT can_view_payments FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. 帳合先マスター
CREATE TABLE IF NOT EXISTS payer_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                                   -- 例: 瀬戸内ブランディング
  closing_day SMALLINT CHECK (closing_day BETWEEN 0 AND 31),  -- 0=月末, 1-31=日付
  pay_month_offset SMALLINT CHECK (pay_month_offset BETWEEN 0 AND 6), -- 1=翌月, 2=翌々月
  pay_day SMALLINT CHECK (pay_day BETWEEN 0 AND 31),    -- 0=月末, 1-31=日付
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE payer_master ENABLE ROW LEVEL SECURITY;

-- 閲覧: 経理閲覧権限を持つ認証ユーザー
CREATE POLICY "Payment viewers can read payer_master" ON payer_master FOR SELECT TO authenticated
  USING (public.current_user_can_view_payments());
-- 書き込み: 編集権限（admin）
CREATE POLICY "Editors can insert payer_master" ON payer_master FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update payer_master" ON payer_master FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete payer_master" ON payer_master FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- 3. venue_master に振込サイクル＋デフォルト帳合先
ALTER TABLE venue_master
  ADD COLUMN IF NOT EXISTS closing_day SMALLINT CHECK (closing_day IS NULL OR (closing_day BETWEEN 0 AND 31)),
  ADD COLUMN IF NOT EXISTS pay_month_offset SMALLINT CHECK (pay_month_offset IS NULL OR (pay_month_offset BETWEEN 0 AND 6)),
  ADD COLUMN IF NOT EXISTS pay_day SMALLINT CHECK (pay_day IS NULL OR (pay_day BETWEEN 0 AND 31)),
  ADD COLUMN IF NOT EXISTS default_payer_id UUID REFERENCES payer_master(id) ON DELETE SET NULL;

-- 4. event_payments
CREATE TABLE IF NOT EXISTS event_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  -- 入金元: 百貨店直取引 or 帳合先（どちらか一方）
  venue_master_id UUID REFERENCES venue_master(id) ON DELETE SET NULL,
  payer_master_id UUID REFERENCES payer_master(id) ON DELETE SET NULL,
  -- 予定
  planned_date DATE,
  planned_amount INTEGER,
  planned_tax_type TEXT CHECK (planned_tax_type IN ('excluded', 'included')),
  -- 実績
  actual_date DATE,
  actual_amount INTEGER,
  -- 支払方法
  method TEXT CHECK (method IN ('transfer', 'cash', 'other')),
  -- ステータス
  status TEXT NOT NULL DEFAULT '予定'
    CHECK (status IN ('予定', '入金済', '保留', 'キャンセル')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- 入金元は片方のみ有効（両方NULLも許可。催事の venue を参照するパターン）
  CONSTRAINT event_payments_payer_xor CHECK (
    venue_master_id IS NULL OR payer_master_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_event_payments_event ON event_payments(event_id);
CREATE INDEX IF NOT EXISTS idx_event_payments_planned_date ON event_payments(planned_date);
CREATE INDEX IF NOT EXISTS idx_event_payments_status ON event_payments(status);

ALTER TABLE event_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payment viewers can read event_payments" ON event_payments FOR SELECT TO authenticated
  USING (public.current_user_can_view_payments());
CREATE POLICY "Editors can insert event_payments" ON event_payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit() AND public.current_user_can_view_payments());
CREATE POLICY "Editors can update event_payments" ON event_payments FOR UPDATE TO authenticated
  USING (public.current_user_can_edit() AND public.current_user_can_view_payments());
CREATE POLICY "Editors can delete event_payments" ON event_payments FOR DELETE TO authenticated
  USING (public.current_user_can_edit() AND public.current_user_can_view_payments());
