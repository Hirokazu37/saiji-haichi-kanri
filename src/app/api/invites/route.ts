import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// GET /api/invites — 招待トークン一覧
export async function GET() {
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
