import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccessToken, sendText, createChannel, currentTarget } from "@/lib/lineworks";

export const dynamic = "force-dynamic";

// 管理用: LINE WORKS連携の動作確認・channelId取得。ログインユーザーのみ。
//   ?action=token                       … 認証情報が正しいか（トークン取得テスト）
//   ?action=send&text=...               … 現在の通知先へテスト送信
//   ?action=create&title=..&members=a@x,b@y … 通知用トークルームを作成し channelId を返す
export async function GET(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "token") {
      const t = await getAccessToken();
      return NextResponse.json({ ok: true, message: "認証情報OK。トークンを取得できました。", tokenPrefix: t.slice(0, 12) + "…" });
    }
    if (action === "send") {
      const target = currentTarget();
      if (!target) return NextResponse.json({ error: "通知先(LINEWORKS_CHANNEL_ID / LINEWORKS_USER_ID)が未設定です" }, { status: 400 });
      await sendText(target, url.searchParams.get("text") || "テスト通知です（催事手配管理）。届いていれば連携成功です。");
      return NextResponse.json({ ok: true, message: "テスト送信しました。LINE WORKSを確認してください。", sentTo: target });
    }
    if (action === "create") {
      const title = url.searchParams.get("title") || "催事DMリマインド";
      const members = (url.searchParams.get("members") || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (members.length === 0) return NextResponse.json({ error: "members=メールアドレスをカンマ区切りで指定してください" }, { status: 400 });
      const channelId = await createChannel(title, members);
      return NextResponse.json({ ok: true, channelId, message: `この channelId を Vercel の LINEWORKS_CHANNEL_ID に設定してください。` });
    }
    return NextResponse.json({ error: "action=token | send | create を指定してください" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
