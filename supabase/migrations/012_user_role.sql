-- user_profiles に role カラムを追加
-- admin : 管理者（編集可能、マネキン評価★も表示）
-- viewer : 閲覧のみ（全画面閲覧可能、ただしマネキン評価★は非表示）
-- limited: 製造スタッフ向け閲覧（ダッシュボード・日程表・社員スケジュールのみ）
ALTER TABLE user_profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin', 'viewer', 'limited'));

-- 既存ユーザーの role を can_edit から自動マッピング
UPDATE user_profiles SET role = 'admin' WHERE can_edit = true;
UPDATE user_profiles SET role = 'viewer' WHERE can_edit = false;
