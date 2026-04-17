-- 招待リンク方式のユーザー登録用トークンテーブル
-- /api/invites で生成、/api/register で消費
CREATE TABLE invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX invite_tokens_token_idx ON invite_tokens(token);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;

-- 編集権限ありのユーザーのみ招待トークンを参照・発行可能
CREATE POLICY "Editors can read invite tokens" ON invite_tokens FOR SELECT TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can insert invite tokens" ON invite_tokens FOR INSERT TO authenticated
  WITH CHECK (public.current_user_can_edit());
CREATE POLICY "Editors can update invite tokens" ON invite_tokens FOR UPDATE TO authenticated
  USING (public.current_user_can_edit());
CREATE POLICY "Editors can delete invite tokens" ON invite_tokens FOR DELETE TO authenticated
  USING (public.current_user_can_edit());
