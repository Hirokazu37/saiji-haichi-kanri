import { createClient } from "@supabase/supabase-js";

// サーバー専用: Service Role Key を使用した管理者クライアント
// ユーザー作成・削除など管理操作に使用。クライアントコンポーネントからインポート禁止
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
