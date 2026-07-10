import { NextResponse } from "next/server";
import { sendText } from "@/lib/lineworks";

export const dynamic = "force-dynamic";

// LINE WORKS Bot のコールバック。トークルームでメッセージやBot追加(join)が起きると
// ここに通知が届く。その中の source.channelId を使って、同じトークルームへ
// 「このルームの channelId は◯◯です」と返信する（グループ通知先の取得補助）。
type Callback = { source?: { channelId?: string; userId?: string }; type?: string };

async function handle(body: Callback) {
  const channelId = body?.source?.channelId;
  if (channelId) {
    try {
      await sendText(
        { channelId },
        `✅ このトークルームの channelId です：\n${channelId}\n\n` +
        `管理者が Vercel の環境変数 LINEWORKS_CHANNEL_ID にこの値を設定すると、\n` +
        `毎朝8時に「本日が投函期限／期限超過」のDMハガキをここに通知します。`
      );
    } catch { /* 返信失敗は無視（IDはログ用途にもなる） */ }
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
