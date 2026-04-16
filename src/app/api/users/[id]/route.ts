import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// PATCH /api/users/[id] — ユーザー更新
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { display_name, password } = body;

  const admin = createAdminClient();

  // 表示名の更新
  if (display_name !== undefined) {
    const { error } = await admin
      .from("user_profiles")
      .update({ display_name })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // パスワードの更新
  if (password) {
    if (password.length < 6) {
      return NextResponse.json(
        { error: "パスワードは6文字以上で設定してください" },
        { status: 400 }
      );
    }

    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 更新後のプロフィールを返す
  const { data: profile } = await admin
    .from("user_profiles")
    .select("*")
    .eq("id", id)
    .single();

  return NextResponse.json(profile);
}

// DELETE /api/users/[id] — ユーザー削除
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 自分自身の削除を禁止
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.id === id) {
    return NextResponse.json(
      { error: "自分自身のアカウントは削除できません" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Auth ユーザー削除（CASCADE で user_profiles も削除される）
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
