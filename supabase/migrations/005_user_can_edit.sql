-- user_profiles に編集権限フラグを追加
ALTER TABLE user_profiles ADD COLUMN can_edit BOOLEAN NOT NULL DEFAULT false;

-- 管理者（hirokazu）は編集可能に設定
UPDATE user_profiles SET can_edit = true WHERE username = 'hirokazu';

-- 編集権限チェック用の関数
CREATE OR REPLACE FUNCTION public.current_user_can_edit()
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT can_edit FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 全テーブルのINSERT/UPDATE/DELETEポリシーを編集権限ありユーザーに制限
-- events
CREATE POLICY "Editors can insert events" ON events FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update events" ON events FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete events" ON events FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- employees
CREATE POLICY "Editors can insert employees" ON employees FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update employees" ON employees FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete employees" ON employees FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- hotels
CREATE POLICY "Editors can insert hotels" ON hotels FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update hotels" ON hotels FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete hotels" ON hotels FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- transportations
CREATE POLICY "Editors can insert transportations" ON transportations FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update transportations" ON transportations FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete transportations" ON transportations FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- mannequins
CREATE POLICY "Editors can insert mannequins" ON mannequins FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update mannequins" ON mannequins FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete mannequins" ON mannequins FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- event_staff
CREATE POLICY "Editors can insert event_staff" ON event_staff FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update event_staff" ON event_staff FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete event_staff" ON event_staff FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- shipments
CREATE POLICY "Editors can insert shipments" ON shipments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update shipments" ON shipments FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete shipments" ON shipments FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- hotel_master
CREATE POLICY "Editors can insert hotel_master" ON hotel_master FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update hotel_master" ON hotel_master FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete hotel_master" ON hotel_master FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- hotel_venue_links
CREATE POLICY "Editors can insert hotel_venue_links" ON hotel_venue_links FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update hotel_venue_links" ON hotel_venue_links FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete hotel_venue_links" ON hotel_venue_links FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- venue_master
CREATE POLICY "Editors can insert venue_master" ON venue_master FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update venue_master" ON venue_master FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete venue_master" ON venue_master FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- venue_mannequin_links
CREATE POLICY "Editors can insert venue_mannequin_links" ON venue_mannequin_links FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update venue_mannequin_links" ON venue_mannequin_links FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete venue_mannequin_links" ON venue_mannequin_links FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- area_master
CREATE POLICY "Editors can insert area_master" ON area_master FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update area_master" ON area_master FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete area_master" ON area_master FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- mannequin_agencies
CREATE POLICY "Editors can insert mannequin_agencies" ON mannequin_agencies FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update mannequin_agencies" ON mannequin_agencies FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete mannequin_agencies" ON mannequin_agencies FOR DELETE TO authenticated
  USING (public.current_user_can_edit());

-- mannequin_staff
CREATE POLICY "Editors can insert mannequin_staff" ON mannequin_staff FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update mannequin_staff" ON mannequin_staff FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete mannequin_staff" ON mannequin_staff FOR DELETE TO authenticated
  USING (public.current_user_can_edit());
