import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/register — 招待トークンを使ってユーザー登録
export async function POST(request: Request) {
  const body = await request.json();
  const { token, username, display_name, password } = body;

  if (!token || !username || !display_name || !password) {
    return NextResponse.json(
      { error: "すべての項目を入力してください" },
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

  // トークン検証
  const { data: invite, error: inviteError } = await admin
    .from("invite_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json(
      { error: "無効な招待リンクです" },
      { status: 400 }
    );
  }

  if (invite.used_at) {
    return NextResponse.json(
      { error: "この招待リンクは既に使用されています" },
      { status: 400 }
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "この招待リンクは有効期限が切れています" },
      { status: 400 }
    );
  }

  // ユーザー作成
  const email = `${username}@yasuoka.app`;

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
  const { error: profileError } = await admin
    .from("user_profiles")
    .insert({
      id: authUser.user.id,
      username,
      display_name,
      can_edit: false,
    });

  if (profileError) {
    await admin.auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  // トークンを使用済みに
  await admin
    .from("invite_tokens")
    .update({ used_by: authUser.user.id, used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ success: true }, { status: 201 });
}
