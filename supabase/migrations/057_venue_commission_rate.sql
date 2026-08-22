-- =========================================================
-- venue_master に売上分担金率を追加
--
-- 背景: 会場 (みどり会など) では 総売上に対して分担金 (%) が引かれる。
-- 精算書の例:
--   税抜売上 718,297 × 9% × 1.1 = 71,111 (分担金・税込)
--
-- 追加カラム:
--  - commission_rate: 会場の売上分担金率 (%)
--                     税抜売上に対する率。実費計算時に消費税 10% で税込化
--                     する側で扱う
-- =========================================================

ALTER TABLE venue_master
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,3)
    CHECK (commission_rate IS NULL OR (commission_rate BETWEEN 0 AND 100));

COMMENT ON COLUMN venue_master.commission_rate IS
  '会場の売上分担金率(%)。例: みどり会=9。税抜総売上に対して掛かる。手数料自体の消費税(10%)は計算側で税込化';

NOTIFY pgrst, 'reload schema';
