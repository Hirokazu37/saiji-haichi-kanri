// そごう横浜店 の入力履歴を調べる
// - events: created_by が無いので他の手がかりを探す
// - notifications: 催事作成時の通知に created_by が入るはず

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envText = fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 1. そごう横浜 に該当する events を検索
const { data: candidates } = await supabase
  .from("events")
  .select("id, name, venue, store_name, start_date, end_date, person_in_charge, created_at, updated_at")
  .or("venue.ilike.%そごう%,venue.ilike.%横浜%,store_name.ilike.%横浜%,name.ilike.%そごう%,name.ilike.%横浜%")
  .order("created_at", { ascending: false });

console.log(`=== そごう/横浜 該当催事: ${candidates?.length ?? 0} 件 ===`);
for (const c of candidates || []) {
  console.log(JSON.stringify({
    id: c.id,
    name: c.name,
    venue: c.venue,
    store_name: c.store_name,
    period: `${c.start_date}〜${c.end_date}`,
    person_in_charge: c.person_in_charge,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }, null, 2));
}

// 2. 該当 event 周辺の notifications を確認 (催事作成時に通知が飛ぶ場合、created_by で作成者判明)
if (candidates && candidates.length > 0) {
  const ids = candidates.map((c) => c.id);
  console.log("\n=== 該当催事に関わる notifications ===");
  const { data: notifs } = await supabase
    .from("notifications")
    .select("id, title, body, created_by, created_at, event_id")
    .in("event_id", ids)
    .order("created_at", { ascending: true });
  if (!notifs || notifs.length === 0) {
    console.log("(該当なし)");
  } else {
    // created_by が UUID なので、user_profiles で名前引く
    const uids = Array.from(new Set(notifs.map((n) => n.created_by).filter(Boolean)));
    let userMap = new Map();
    if (uids.length > 0) {
      const { data: users } = await supabase
        .from("user_profiles")
        .select("id, display_name, email, role")
        .in("id", uids);
      userMap = new Map((users || []).map((u) => [u.id, u]));
    }
    for (const n of notifs) {
      const u = n.created_by ? userMap.get(n.created_by) : null;
      console.log(JSON.stringify({
        created_at: n.created_at,
        by_uid: n.created_by,
        by_display: u?.display_name || u?.email || "(不明)",
        by_role: u?.role,
        title: n.title,
        event_id: n.event_id,
      }, null, 2));
    }
  }
}

// 3. 追加ヒント: 直近1週間の events 作成状況（同時期の他の登録との突き合わせ用）
console.log("\n=== 直近7日間に作られた events (時系列) ===");
const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
const { data: recent } = await supabase
  .from("events")
  .select("id, venue, store_name, start_date, person_in_charge, created_at")
  .gte("created_at", weekAgo)
  .order("created_at", { ascending: true });
for (const r of recent || []) {
  console.log(`  ${r.created_at?.slice(0, 19).replace("T", " ")} | ${r.venue}${r.store_name ? " " + r.store_name : ""} (${r.start_date}) 担当: ${r.person_in_charge || "-"}`);
}
