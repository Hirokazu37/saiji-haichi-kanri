-- payer_master の SELECT を「経理閲覧権限者 OR 編集権限者(admin)」に拡張する。
--
-- 背景:
-- これまで payer_master.SELECT は経理閲覧権限者にのみ開放されていたが、
-- admin (編集権限あり) でも経理閲覧権限が無いユーザーは、
-- /venue-master の「デフォルト帳合先」ドロップダウンが空に見える問題があった。
--
-- venue_master の編集（百貨店ごとの帳合先紐づけ）は admin の業務範疇なので、
-- admin にも閲覧を許可する。
-- ※ 書き込み（帳合先マスター自体の編集）はそのまま admin のみ。

DROP POLICY IF EXISTS "Payment viewers can read payer_master" ON payer_master;

CREATE POLICY "Editors or payment viewers can read payer_master"
  ON payer_master FOR SELECT TO authenticated
  USING (public.current_user_can_view_payments() OR public.current_user_can_edit());

NOTIFY pgrst, 'reload schema';
