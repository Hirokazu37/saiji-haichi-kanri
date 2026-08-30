-- =========================================================
-- events テーブルに 作成者/更新者 の自動記録を追加
--
-- 背景: 誤登録が発生した際に「誰が入力したか」を追跡できるようにする。
-- person_in_charge は担当者名の文字列で、実際にログインしたユーザーとは
-- 限らない (誰でも他人の名前で入力できる)。
--
-- 追加:
--  - events.created_by      UUID (auth.users への参照、初回作成者)
--  - events.updated_by      UUID (auth.users への参照、最終更新者)
--  - BEFORE INSERT/UPDATE トリガーで auth.uid() を自動セット
--    (service_role 経由の書き込みでは auth.uid() が NULL なので何もセットされない)
-- =========================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN events.created_by IS
  'この催事を初回作成した認証ユーザーの UUID。トリガーで auth.uid() を自動セット';
COMMENT ON COLUMN events.updated_by IS
  'この催事を最後に更新した認証ユーザーの UUID。トリガーで auth.uid() を自動セット';

-- INSERT 時: created_by と updated_by の両方に auth.uid() をセット (明示指定がなければ)
CREATE OR REPLACE FUNCTION public.events_set_created_by()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- UPDATE 時: updated_by を auth.uid() で上書き (created_by は不変)
CREATE OR REPLACE FUNCTION public.events_set_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  -- created_by はユーザー側から変更させない
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_events_set_created_by ON events;
CREATE TRIGGER trg_events_set_created_by
  BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_created_by();

DROP TRIGGER IF EXISTS trg_events_set_updated_by ON events;
CREATE TRIGGER trg_events_set_updated_by
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION public.events_set_updated_by();

NOTIFY pgrst, 'reload schema';
