-- ユーザーごとの最終アクセス日時を user_profiles 側で管理する。
-- auth.users.last_sign_in_at はトークン発行日時で、セッションが裏で
-- 自動 refresh されている間は更新されないため「最終ログイン」として
-- 不正確だった。代わりにアプリ側で last_active_at を更新する。

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- 既存ユーザーは created_at で初期化（NULL より無難）
UPDATE user_profiles SET last_active_at = created_at WHERE last_active_at IS NULL;

NOTIFY pgrst, 'reload schema';
