-- ============================================================
-- 校正PDFの履歴保存（いつ・どの版を校正に出したか）
-- ============================================================
-- 生成した校正PDFを Supabase Storage の "proofs" バケットに保存し、
-- 催事ごとにメタdata（ファイル名・種別・メモ・保存者）を event_proofs に残す。
-- バケットは非公開。ダウンロードは署名付きURLで行う。
-- ============================================================

-- 非公開バケット
INSERT INTO storage.buckets (id, name, public)
VALUES ('proofs', 'proofs', false)
ON CONFLICT (id) DO NOTHING;

-- 認証ユーザーは proofs バケットを読み書きできる
DROP POLICY IF EXISTS "proofs authenticated all" ON storage.objects;
CREATE POLICY "proofs authenticated all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'proofs')
  WITH CHECK (bucket_id = 'proofs');

-- 校正PDFの履歴メタデータ
CREATE TABLE IF NOT EXISTS event_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  path TEXT NOT NULL,          -- storage 上のパス（proofs バケット内）
  file_name TEXT,              -- 表示用のファイル名
  kind TEXT,                   -- 裏面の種別（即売 / 実演）
  note TEXT,                   -- 任意メモ
  created_by TEXT,             -- 保存した社員名
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_proofs_event ON event_proofs(event_id);

ALTER TABLE event_proofs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_proofs;
CREATE POLICY "Authenticated users can do everything" ON event_proofs
  FOR ALL USING (auth.role() = 'authenticated');
