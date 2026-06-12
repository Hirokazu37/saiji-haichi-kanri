-- ============================================================
-- 顧客CSV取込履歴
-- ============================================================
-- 「いつ・どのファイルを・どの区分に・何件」取り込んだかを記録し、
-- 名簿の取り違え（別の百貨店の区分に紐付けてしまう等）に
-- 後から気付けるようにする。
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL,
  imported_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  kbn_no SMALLINT,                  -- 紐付けた区分 (NULL = 区分紐付けなし or 列モード)
  code SMALLINT,
  segment_label TEXT,               -- 取込時点の区分名のスナップショット
  mode TEXT NOT NULL DEFAULT 'fixed',  -- fixed (区分指定) / columns (列から読取)
  imported_by TEXT,                 -- 取込したユーザーの表示名
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_import_logs_created ON customer_import_logs(created_at DESC);

ALTER TABLE customer_import_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON customer_import_logs;
CREATE POLICY "Authenticated users can do everything" ON customer_import_logs
  FOR ALL USING (auth.role() = 'authenticated');
