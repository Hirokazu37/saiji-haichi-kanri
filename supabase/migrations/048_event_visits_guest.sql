-- ============================================================
-- 番号なし来場（新規・はがき忘れ等）の記録と、ロスター一致ヒット率
-- ============================================================
-- ・新規のお客様や、番号が特定できない来場を「番号なし」で残せるようにする
-- ・DMヒット率は「名簿(event_dm_recipients)に一致した来場」だけを分子にする
--   （別階・別経由などロスター外の来場は総来場には含むがヒット率からは除く）
-- ============================================================

-- customer_id を任意に（番号なし来場を許可）
ALTER TABLE event_visits ALTER COLUMN customer_id DROP NOT NULL;
-- 番号なし来場のための列
ALTER TABLE event_visits ADD COLUMN IF NOT EXISTS guest_name TEXT;  -- 任意のお名前メモ
ALTER TABLE event_visits ADD COLUMN IF NOT EXISTS reason TEXT;      -- 新規 / はがき忘れ / その他

-- 集計ビューを拡張: 総来場 / 名簿一致 / 番号なし
CREATE OR REPLACE VIEW event_visit_counts
WITH (security_invoker = true) AS
SELECT v.event_id,
  COUNT(*)::int AS visit_count,
  COUNT(*) FILTER (WHERE r.customer_id IS NOT NULL)::int AS matched_count,
  COUNT(*) FILTER (WHERE v.customer_id IS NULL)::int AS guest_count
FROM event_visits v
LEFT JOIN event_dm_recipients r
  ON r.event_id = v.event_id AND r.customer_id = v.customer_id
GROUP BY v.event_id;
