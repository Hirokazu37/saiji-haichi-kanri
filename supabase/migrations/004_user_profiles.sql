-- ユーザープロフィールテーブル
-- auth.users と紐づけてユーザー名・表示名を管理
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは全プロフィールを参照可能
CREATE POLICY "Authenticated users can read all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

-- 自分のプロフィールのみ更新可能
CREATE POLICY "Authenticated users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);
