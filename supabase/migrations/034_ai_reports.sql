-- ============================================================
-- AIレポート保存テーブル (ai_reports)
-- ============================================================
-- AI戦略コンサルなど、生成したレポートを保存していつでも読み返せる
-- ようにする。kind でレポート種別を区別 (strategy = 戦略コンサル)。
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'strategy',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_kind_created
  ON ai_reports(kind, created_at DESC);

ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "認証ユーザーはAIレポートを閲覧・編集可能" ON ai_reports;
CREATE POLICY "認証ユーザーはAIレポートを閲覧・編集可能" ON ai_reports
  FOR ALL USING (auth.role() = 'authenticated');
