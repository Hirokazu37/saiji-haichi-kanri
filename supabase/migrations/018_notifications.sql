-- =========================================================
-- Vol29: アプリ内通知（ベル）機能
-- - notifications: 通知本体（誰が何を起こしたかの記録）
-- - notification_reads: ユーザーごとの既読フラグ
-- 表示対象は admin ロールのみ（アプリ側で制御）
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,                         -- 'event_created' など
  title TEXT NOT NULL,                        -- ベルに出る短い見出し
  body TEXT,                                  -- 補足説明
  link_url TEXT,                              -- クリック時の遷移先（例: /events/<id>）
  related_event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc
  ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user
  ON notification_reads(user_id);

-- ===== RLS =====
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは通知を読める（admin絞り込みはアプリ側）
DROP POLICY IF EXISTS "Authenticated can read notifications" ON notifications;
CREATE POLICY "Authenticated can read notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (true);

-- 認証済みユーザーが通知を作れる（イベント作成時など）
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON notifications;
CREATE POLICY "Authenticated can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 既読は自分の分だけ読める/書ける
DROP POLICY IF EXISTS "User can read own reads" ON notification_reads;
CREATE POLICY "User can read own reads"
  ON notification_reads FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "User can insert own reads" ON notification_reads;
CREATE POLICY "User can insert own reads"
  ON notification_reads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "User can delete own reads" ON notification_reads;
CREATE POLICY "User can delete own reads"
  ON notification_reads FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
