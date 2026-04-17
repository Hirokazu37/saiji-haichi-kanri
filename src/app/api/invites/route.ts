import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// ログイン中ユーザーが編集権限を持つか確認する
async function requireEditor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未認証です" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("can_edit")
    .eq("id", user.id)
    .single();

  if (!profile?.can_edit) {
    return NextResponse.json({ error: "編集権限が必要です" }, { status: 403 });
  }

  return null;
}

// GET /api/invites — 招待トークン一覧
export async function GET() {
  const forbidden = await requireEditor();
  if (forbidden) return forbidden;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invite_tokens")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/invites — 招待トークン生成
export async function POST() {
  const forbidden = await requireEditor();
  if (forbidden) return forbidden;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("invite_tokens")
    .insert({})
    .select("id, token, expires_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
