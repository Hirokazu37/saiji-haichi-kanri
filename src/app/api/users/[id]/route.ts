import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const VALID_ROLES = ["admin", "viewer", "limited"] as const;
type Role = (typeof VALID_ROLES)[number];

function isRole(v: unknown): v is Role {
  return typeof v === "string" && (VALID_ROLES as readonly string[]).includes(v);
}

// PATCH /api/users/[id] — ユーザー更新
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { display_name, password, role } = body;

  const admin = createAdminClient();

  // プロフィールの更新
  const profileUpdate: Record<string, unknown> = {};
  if (display_name !== undefined) profileUpdate.display_name = display_name;
  if (role !== undefined) {
    if (!isRole(role)) {
      return NextResponse.json({ error: "権限の値が不正です" }, { status: 400 });
    }
    profileUpdate.role = role;
    // can_edit は role から派生させる（RLS 側は can_edit を参照しているため）
    profileUpdate.can_edit = role === "admin";
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await admin
      .from("user_profiles")
      .update(profileUpdate)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // パスワードの更新
  if (password) {
    if (password.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上で設定してください" },
        { status: 400 }
      );
    }

    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

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

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
