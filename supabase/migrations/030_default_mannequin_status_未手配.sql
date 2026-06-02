-- ============================================================
-- mannequin_arrangement_status: NULL を廃止して '未手配' に統一
-- ============================================================
-- 「何もしていない催事は『未手配』として明示的に管理したい」という方針へ移行。
-- これまでの NULL = 「未設定 (空欄)」と『未手配』を分けて持つ意味が薄いため、
-- NULL は全て '未手配' に統合する。
--
-- このマイグレーションでやること:
--   ① 既存の NULL を全て '未手配' に backfill
--   ② 列の DEFAULT を '未手配' に設定 (新規催事は自動で '未手配')
--
-- なお、今後 NULL に戻したい場合 (= ステータス管理対象から外したい場合)
-- は明示的に UPDATE で NULL を入れれば良い。デフォルトを変えるだけで
-- NOT NULL 制約は付けないので、ユーザー側で抜け道は残してある。
-- ============================================================

-- ① 既存 NULL を '未手配' に backfill
UPDATE events
SET mannequin_arrangement_status = '未手配'
WHERE mannequin_arrangement_status IS NULL;

-- ② 列のデフォルトを '未手配' に
ALTER TABLE events
  ALTER COLUMN mannequin_arrangement_status SET DEFAULT '未手配';

COMMENT ON COLUMN events.mannequin_arrangement_status IS
  'マネキン手配ステータス (デフォルト: 未手配 / 確定 / 完了 / NULL=対象外)。マネキンの手配一覧画面で進捗管理に使用。';
