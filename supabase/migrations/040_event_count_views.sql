-- ============================================================
-- 催事ごとの来場数・名簿数の集計ビュー
-- ============================================================
-- 顧客・来場管理のカレンダーに「来場人数・ヒット率・入力済みかどうか」を
-- 表示するための軽量な集計。security_invoker により呼び出しユーザーの
-- RLS（認証必須）がそのまま適用される。
-- ============================================================

CREATE OR REPLACE VIEW event_visit_counts
WITH (security_invoker = true) AS
SELECT event_id, COUNT(*)::int AS visit_count
FROM event_visits
GROUP BY event_id;

CREATE OR REPLACE VIEW event_roster_counts
WITH (security_invoker = true) AS
SELECT event_id, COUNT(*)::int AS roster_count
FROM event_dm_recipients
GROUP BY event_id;
