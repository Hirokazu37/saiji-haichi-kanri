import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
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
    if (action === "diag") {
      // 値そのものは出さず、設定状況だけ確認する（切り分け用）
      const cid = process.env.LINEWORKS_CLIENT_ID || "";
      const sa = process.env.LINEWORKS_SERVICE_ACCOUNT || "";
      const pk = (process.env.LINEWORKS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
      return NextResponse.json({
        clientId: cid ? `${cid.slice(0, 6)}…(${cid.length}文字)` : "未設定",
        clientSecret: process.env.LINEWORKS_CLIENT_SECRET ? `設定あり(${(process.env.LINEWORKS_CLIENT_SECRET || "").length}文字)` : "未設定",
        serviceAccount: sa || "未設定", // ID自体は確認のため表示（@...serviceaccount 形式か）
        serviceAccountLooksValid: /serviceaccount/i.test(sa),
        privateKey: pk ? `${pk.length}文字 / BEGIN=${pk.includes("BEGIN PRIVATE KEY")} / END=${pk.includes("END PRIVATE KEY")}` : "未設定",
        botId: process.env.LINEWORKS_BOT_ID || "未設定",
        target: process.env.LINEWORKS_CHANNEL_ID ? "channelId(グループ)" : process.env.LINEWORKS_USER_ID ? "userId(個人・内部ID)" : "未設定",
        channelIdValue: process.env.LINEWORKS_CHANNEL_ID || "(未設定)",
        userIdValue: process.env.LINEWORKS_USER_ID || "(未設定)",
      });
    }
    if (action === "dbcheck") {
      // コールバック記録に使う service role キーが有効か確認する
      const surl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const skey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      if (!surl || !skey) return NextResponse.json({ serviceKey: skey ? "設定あり" : "未設定", error: "URLかservice roleキーが未設定" });
      const svc = createServiceClient(surl, skey, { auth: { persistSession: false } });
      const probe = `dbcheck-${Date.now()}`;
      const ins = await svc.from("ai_reports").insert({ kind: "lineworks_dbcheck", title: probe, content: "probe" });
      if (ins.error) return NextResponse.json({ ok: false, serviceKey: `設定あり(${skey.length}文字)`, writable: false, error: ins.error.message });
      await svc.from("ai_reports").delete().eq("kind", "lineworks_dbcheck");
      return NextResponse.json({ ok: true, serviceKey: `設定あり(${skey.length}文字)`, writable: true, message: "service roleキーOK（コールバック記録が可能）" });
    }
    if (action === "lastcallback") {
      // 直近のコールバック受信を確認（Botにメッセージ→ここで channelId/userId を拾う）
      const { data } = await sb
        .from("ai_reports")
        .select("title, content, created_at")
        .eq("kind", "lineworks_callback")
        .order("created_at", { ascending: false })
        .limit(5);
      if (!data || data.length === 0) {
        return NextResponse.json({ ok: true, message: "まだコールバックを受信していません。Botにメッセージを送ってから再度開いてください。（届いていない＝Bot設定のMessage Eventが未ONの可能性）", records: [] });
      }
      return NextResponse.json({ ok: true, message: "直近のコールバック受信。channelId/userId をコピーして環境変数に設定してください。", records: data });
    }
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
