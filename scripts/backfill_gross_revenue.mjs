// paypay_amount > 0 のデータがある催事について、
// events.revenue を 総売上(=現金+PayPay) の税込合計に補正する。
//
// 旧UI:「amount=総売上」で保存 → events.revenue も総売上税込 (正しかった)
// 新UI:「amount=現金分」「paypay_amount=PayPay分」で保存 → events.revenue は
//      旧計算ロジック（amount税込のみ）だと PayPay分が漏れて過小になる
//
// このスクリプトは、paypay_amount>0 のある催事だけ再計算して補正する。
// 影響を受けないデータ（paypay_amount=0）は触らない。

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

const toIncluded = (n, r) => Math.round(n * (1 + r));

// paypay_amount > 0 の event_daily_revenue がある event_id を全部取得
const { data: paypayRows } = await supabase
  .from("event_daily_revenue")
  .select("event_id")
  .gt("paypay_amount", 0);

const eventIds = Array.from(new Set((paypayRows || []).map((r) => r.event_id)));
console.log(`paypay 分がある催事: ${eventIds.length} 件`);

for (const eventId of eventIds) {
  const { data: daily } = await supabase
    .from("event_daily_revenue")
    .select("amount, paypay_amount, tax_type, tax_rate")
    .eq("event_id", eventId);
  const { data: ev } = await supabase
    .from("events")
    .select("id, name, venue, store_name, revenue")
    .eq("id", eventId)
    .single();

  let includedTotal = 0;
  for (const d of daily || []) {
    const gross = (d.amount ?? 0) + (d.paypay_amount ?? 0);
    if (d.tax_type === "excluded") {
      includedTotal += toIncluded(gross, d.tax_rate ?? 0.08);
    } else {
      includedTotal += gross;
    }
  }
  const oldRev = ev?.revenue ?? 0;
  const label = `${ev?.venue}${ev?.store_name ? " " + ev.store_name : ""}${ev?.name ? " / " + ev.name : ""}`;
  if (oldRev === includedTotal) {
    console.log(`  = ${label}: ¥${includedTotal.toLocaleString()} (変更なし)`);
    continue;
  }
  console.log(`  → ${label}: ¥${oldRev.toLocaleString()} → ¥${includedTotal.toLocaleString()}`);
  const { error } = await supabase
    .from("events")
    .update({ revenue: includedTotal })
    .eq("id", eventId);
  if (error) console.log(`    FAIL: ${error.message}`);
}
console.log("完了");
