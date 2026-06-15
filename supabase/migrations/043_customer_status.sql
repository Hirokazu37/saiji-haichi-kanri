-- ============================================================
-- 顧客の状態（DM送付対象の管理）
-- ============================================================
-- 有効     : 通常のDM送付対象
-- 宛先不明 : DMが返送された等。送付・抽出から除外
-- 削除候補 : 産直くんの得意先マスタに存在しなくなった（全件CSV照合で検出）
-- 役割分担（産直くん＝原本）は維持しつつ、アプリ側のズレを管理する。
-- ============================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '有効';
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- 全件CSV照合で「産直くんに最後に存在を確認した日時」を記録する（任意）
ALTER TABLE customers ADD COLUMN IF NOT EXISTS master_seen_at TIMESTAMPTZ;
