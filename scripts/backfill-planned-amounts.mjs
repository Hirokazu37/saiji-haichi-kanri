// event_payments.planned_amount が null で、event_daily_revenue が入っている催事を
// 一括で補完する。auto-fill ロジックを過去データに対しても適用する。

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

async function main() {
  // planned_amount が null の event_payments
  const { data: payments, error } = await supabase
    .from("event_payments")
    .select("id, event_id, planned_tax_type, applied_rate, events(id, venue, store_name, end_date)")
    .is("planned_amount", null);
  if (error) { console.error(error); process.exit(1); }

  console.log(`対象: ${payments?.length ?? 0}件 (planned_amount=null)`);
  let filled = 0;
  let noRate = 0;
  let noSales = 0;

  for (const p of payments ?? []) {
    const ev = p.events;
    const label = ev ? `${ev.venue}${ev.store_name ? " " + ev.store_name : ""} (${ev.end_date})` : "(不明)";

    // 日別売上を取得して税抜合計を計算
    const { data: daily } = await supabase
      .from("event_daily_revenue")
      .select("amount, tax_type, tax_rate")
      .eq("event_id", p.event_id);

    let salesExcluded = 0;
    let salesIncluded = 0;
    for (const d of daily ?? []) {
      if (d.tax_type === "excluded") {
        salesExcluded += d.amount;
        salesIncluded += Math.round(d.amount * (1 + (d.tax_rate ?? 0.08)));
      } else {
        salesIncluded += d.amount;
        salesExcluded += Math.round(d.amount / (1 + (d.tax_rate ?? 0.08)));
      }
    }

    if (salesExcluded === 0) {
      console.log(`  SKIP ${label}: 日別売上が未入力`);
      noSales++;
      continue;
    }
    if (p.applied_rate == null) {
      console.log(`  SKIP ${label}: applied_rate=null`);
      noRate++;
      continue;
    }

    const taxType = p.planned_tax_type ?? "excluded";
    const base = taxType === "excluded" ? salesExcluded : salesIncluded;
    const amount = Math.round((base * p.applied_rate) / 100);

    const { error: upErr } = await supabase
      .from("event_payments")
      .update({ planned_amount: amount })
      .eq("id", p.id);
    if (upErr) {
      console.log(`  FAIL ${label}: ${upErr.message}`);
    } else {
      console.log(`  ✓ ${label}: ¥${amount.toLocaleString()} (税抜売上 ¥${salesExcluded.toLocaleString()} × ${p.applied_rate}%)`);
      filled++;
    }
  }

  console.log("");
  console.log(`合計: 補完 ${filled}件 / 売上未入力 ${noSales}件 / 入金率未設定 ${noRate}件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
