import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// API ルートで「呼び出し元が admin か」を検証するヘルパー。
// 認証なし/非adminなら NextResponse を返す。認可OKなら { userId } を返す。
export async function requireAdmin(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "認証が必要です" }, { status: 401 }),
    };
  }

  // user_profiles の role を RLS 非経由で読む（呼び出し元の権限に依存しない）
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "この操作には管理者権限が必要です" },
        { status: 403 }
      ),
    };
  }

  return { userId: user.id };
}
