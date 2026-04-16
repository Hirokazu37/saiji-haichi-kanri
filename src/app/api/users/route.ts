import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/users — ユーザー一覧
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/users — ユーザー作成
export async function POST(request: Request) {
  const body = await request.json();
  const { username, display_name, password, can_edit } = body;

  if (!username || !display_name || !password) {
    return NextResponse.json(
      { error: "ユーザー名、表示名、パスワードは必須です" },
      { status: 400 }
    );
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json(
      { error: "ユーザー名は半角英数字・ハイフン・アンダースコアのみ使用できます" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "パスワードは6文字以上で設定してください" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const email = `${username}@yasuoka.app`;

  // Supabase Auth にユーザー作成
  const { data: authUser, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    if (authError.message.includes("already been registered")) {
      return NextResponse.json(
        { error: "このユーザー名は既に使用されています" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // user_profiles に登録
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .insert({
      id: authUser.user.id,
      username,
      display_name,
      can_edit: can_edit ?? false,
    })
    .select()
    .single();

  if (profileError) {
    // プロフィール作成失敗時はAuthユーザーも削除
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json(profile, { status: 201 });
}
