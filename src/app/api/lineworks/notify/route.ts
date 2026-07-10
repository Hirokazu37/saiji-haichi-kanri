import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendText, currentTarget } from "@/lib/lineworks";
import { mailDeadline } from "@/lib/event-status";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// JSTの今日（YYYY-MM-DD）。Vercel(UTC)実行でも日本時間で判定する。
function todayJst(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().slice(0, 10);
}

type Ev = { venue: string; store_name: string | null; start_date: string; end_date: string; dm_status: string | null; status: string };

export async function GET(req: Request) {
  // Cron認証: CRON_SECRET があれば Authorization: Bearer で照合（Vercel Cronが自動付与）
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = currentTarget();
  if (!target) return NextResponse.json({ error: "通知先(LINEWORKS_CHANNEL_ID か LINEWORKS_USER_ID)が未設定です" }, { status: 500 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase接続情報(SUPABASE_SERVICE_ROLE_KEY)が未設定です" }, { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const today = todayJst();
  const { data, error } = await sb.from("events").select("venue, store_name, start_date, end_date, dm_status, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const evs = (data || []) as Ev[];

  // 印刷済み(投函待ち)で会期がまだ終わっていないもの
  const mailable = (e: Ev) => e.dm_status === "印刷済み" && e.status !== "終了" && e.end_date >= today;
  const due = evs.filter((e) => mailable(e) && mailDeadline(e.start_date) === today);
  const overdue = evs.filter((e) => mailable(e) && mailDeadline(e.start_date) < today);

  if (due.length === 0 && overdue.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "本日通知する対象はありません" });
  }

  const label = (e: Ev) => `${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`;
  const lines: string[] = ["📮 DMハガキ 投函リマインド"];
  if (due.length) {
    lines.push("", `【本日が投函期限】${due.length}件`);
    due.forEach((e) => lines.push(`・${label(e)}（会期 ${e.start_date}〜）`));
  }
  if (overdue.length) {
    lines.push("", `【⚠ 期限超過・未投函】${overdue.length}件`);
    overdue.forEach((e) => lines.push(`・${label(e)}（会期 ${e.start_date}〜）`));
  }
  lines.push("", "投函したらアプリで「投函した」を押してください。", "https://events.yasuokakamaboko.co.jp/dm");

  try {
    await sendText(target, lines.join("\n"));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent: true, due: due.length, overdue: overdue.length });
}
