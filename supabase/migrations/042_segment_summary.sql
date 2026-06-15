-- ============================================================
-- 百貨店（DM区分）ごとの顧客サマリ
-- ============================================================
-- 「経由＝DM区分」を正として、区分(店)ごとに
--   顧客数 / 来場実績のある顧客数
-- を集計する。顧客数が増えても店ごとに状況を把握できるようにする。
-- 反応率は画面側で 来場あり ÷ 顧客数 で算出。
-- security_invoker により呼び出しユーザーの RLS（認証必須）が適用される。
-- ============================================================

CREATE OR REPLACE VIEW segment_customer_summary
WITH (security_invoker = true) AS
SELECT
  cs.kbn_no,
  cs.code,
  COUNT(DISTINCT cs.customer_id)::int AS customer_count,
  COUNT(DISTINCT v.customer_id)::int  AS visited_count
FROM customer_segments cs
LEFT JOIN event_visits v ON v.customer_id = cs.customer_id
GROUP BY cs.kbn_no, cs.code;
