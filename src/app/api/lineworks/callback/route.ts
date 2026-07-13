import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendText, verifyCallbackSignature } from "@/lib/lineworks";

export const dynamic = "force-dynamic";

// LINE WORKS Bot のコールバック。トークルームでメッセージやBot追加(join)が起きると
// ここに通知が届く。source.channelId / source.userId を記録し、可能なら同じ場所へ返信する。
// 認証は middleware を通さず、X-WORKS-Signature（LINEWORKS_BOT_SECRET）で検証する。
type Callback = { source?: { channelId?: string; userId?: string }; type?: string };

// 受信内容を ai_reports(kind=lineworks_callback) に控える（返信が届かなくても画面で確認できるように）
async function logCallback(raw: unknown, channelId?: string, userId?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return;
  try {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    await sb.from("ai_reports").insert({
      kind: "lineworks_callback",
      title: `callback ch=${channelId || "-"} user=${userId || "-"}`,
      content: JSON.stringify(raw).slice(0, 4000),
    });
  } catch { /* 記録失敗は無視 */ }
}

async function handle(body: Callback) {
  const channelId = body?.source?.channelId;
  const userId = body?.source?.userId;
  await logCallback(body, channelId, userId);

  const lines = ["✅ 連携用のIDです"];
  if (channelId) lines.push(`・グループ用 channelId：\n${channelId}`);
  if (userId) lines.push(`・個人用 userId：\n${userId}`);
  lines.push("", "管理者がVercelの環境変数に設定します（グループ=LINEWORKS_CHANNEL_ID / 個人=LINEWORKS_USER_ID）。");
  const target = channelId ? { channelId } : userId ? { userId } : null;
  if (target) {
    try { await sendText(target, lines.join("\n")); } catch { /* 返信失敗は無視（IDは記録済み） */ }
  }
}

export async function POST(req: Request) {
  // 署名検証: LINEWORKS_BOT_SECRET を設定していれば不正な呼び出しを拒否する。
  // 未設定の間は null が返り、暫定的に素通し（channelId 発見フローを壊さないため）。
  const raw = await req.text();
  const verdict = verifyCallbackSignature(raw, req.headers.get("x-works-signature"));
  if (verdict === false) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: Callback = {};
  try { body = raw ? (JSON.parse(raw) as Callback) : {}; } catch { /* 空でもOK */ }
  await handle(body);
  return NextResponse.json({ ok: true });
}

// コールバックURL登録時の疎通確認用（GETに200を返す）
export async function GET() {
  return NextResponse.json({ ok: true });
}
