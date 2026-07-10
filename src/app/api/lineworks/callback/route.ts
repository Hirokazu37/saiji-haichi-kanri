import { NextResponse } from "next/server";
import { sendText } from "@/lib/lineworks";

export const dynamic = "force-dynamic";

// LINE WORKS Bot のコールバック。トークルームでメッセージやBot追加(join)が起きると
// ここに通知が届く。その中の source.channelId を使って、同じトークルームへ
// 「このルームの channelId は◯◯です」と返信する（グループ通知先の取得補助）。
type Callback = { source?: { channelId?: string; userId?: string }; type?: string };

async function handle(body: Callback) {
  const channelId = body?.source?.channelId;
  const userId = body?.source?.userId;
  const lines = ["✅ 連携用のIDです"];
  if (channelId) lines.push(`・グループ用 channelId：\n${channelId}`);
  if (userId) lines.push(`・個人用 userId：\n${userId}`);
  lines.push("", "管理者がVercelの環境変数に設定します（グループ=LINEWORKS_CHANNEL_ID / 個人=LINEWORKS_USER_ID）。");
  // 送信先: channelId があればそのルーム、無ければ送信者(userId)へ
  const target = channelId ? { channelId } : userId ? { userId } : null;
  if (target) {
    try { await sendText(target, lines.join("\n")); } catch { /* 返信失敗は無視 */ }
  }
}

export async function POST(req: Request) {
  let body: Callback = {};
  try { body = (await req.json()) as Callback; } catch { /* 空でもOK */ }
  await handle(body);
  return NextResponse.json({ ok: true });
}

// コールバックURL登録時の疎通確認用（GETに200を返す）
export async function GET() {
  return NextResponse.json({ ok: true });
}
