// そごう横浜店 (重複・誤登録) を削除するスクリプト。
// event_id = 790a7c4d-9409-4931-81c0-b178a13f270c
// 事前に子レコードの有無を確認し、あれば一覧を出して削除しない。無ければ削除。

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

const EVENT_ID = "790a7c4d-9409-4931-81c0-b178a13f270c";

// 子テーブル一覧 (RLSやCASCADEはあるが、事前に見える化して安全確認)
const CHILD_TABLES = [
  "event_payments",
  "event_daily_revenue",
  "event_staff",
  "event_visits",
  "event_dm_recipients",
  "event_dm_segments",
  "event_visit_undo_log",
  "event_proofs",
  "event_postcards",
  "mannequins",
  "hotels",
  "transports",
];

console.log(`=== 削除対象: event_id = ${EVENT_ID} ===`);
const { data: ev } = await supabase.from("events").select("*").eq("id", EVENT_ID).single();
if (!ev) { console.log("(既に存在しません)"); process.exit(0); }
console.log(`  venue: ${ev.venue}${ev.store_name ? " " + ev.store_name : ""}`);
console.log(`  period: ${ev.start_date}〜${ev.end_date}`);
console.log(`  person_in_charge: ${ev.person_in_charge}`);
console.log(`  created_at: ${ev.created_at}`);

console.log("\n=== 子レコード確認 ===");
let hasChildren = false;
for (const t of CHILD_TABLES) {
  try {
    const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true }).eq("event_id", EVENT_ID);
    if (error) {
      console.log(`  ${t}: (テーブル無しorエラー: ${error.message?.slice(0, 60)})`);
      continue;
    }
    if ((count || 0) > 0) {
      console.log(`  ${t}: ${count} 件 ← 存在`);
      hasChildren = true;
    } else {
      console.log(`  ${t}: 0 件`);
    }
  } catch (e) {
    console.log(`  ${t}: (skip) ${e.message?.slice(0, 60)}`);
  }
}

if (hasChildren) {
  console.log("\n⚠️ 子レコードが存在します。CASCADE 削除される想定ですが、内容を確認してください。");
  console.log("   自動で削除は行いません。UIから削除してください、または再度スクリプトを --force で実行してください。");
  process.exit(1);
}

console.log("\n子レコードなし → 削除実行");
const { error } = await supabase.from("events").delete().eq("id", EVENT_ID);
if (error) {
  console.log(`削除失敗: ${error.message}`);
  process.exit(1);
}
console.log("✅ 削除完了");
