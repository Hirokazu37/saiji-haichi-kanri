-- ============================================================
-- 来場取消の履歴（復元用）
-- ============================================================
-- 来場記録の取消（削除）時に、何を消したかをログに残す。
-- 誤って取り消した場合に「最近取り消した記録」から復元できる。
-- ============================================================

CREATE TABLE IF NOT EXISTS event_visit_undo_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  notes TEXT,                          -- 取消時点の来場メモ
  deleted_by TEXT,                     -- 取消したユーザーの表示名
  deleted_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_visit_undo_log_event ON event_visit_undo_log(event_id, deleted_at DESC);

ALTER TABLE event_visit_undo_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can do everything" ON event_visit_undo_log;
CREATE POLICY "Authenticated users can do everything" ON event_visit_undo_log
  FOR ALL USING (auth.role() = 'authenticated');
