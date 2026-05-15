// 売上ありで event_payments が無い催事に対して、レコードを自動作成する
// venue_master の振込サイクルと direct_receive_rate を使う
// rate が未設定の催事は planned_amount=null で行だけ作る

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

// .env.local を手動でパース
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");
const envText = fs.readFileSync(envPath, "utf8");
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) {
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// payment-cycle.ts を簡易再実装（ESM 直 import が面倒なので）
function endOfMonth(year, month) { return new Date(year, month, 0); }
function dayInMonth(year, month, day) {
  if (day === 0) return endOfMonth(year, month);
  const last = endOfMonth(year, month).getDate();
  return new Date(year, month - 1, Math.min(day, last));
}
function fmtYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function computePlannedPaymentDate(eventEnd, cycle) {
  const end = parseYmd(eventEnd);
  if (!end) return null;
  const { closing_day, pay_month_offset, pay_day } = cycle;
  if (closing_day == null || pay_month_offset == null || pay_day == null) return null;
  let closeYear = end.getFullYear();
  let closeMonth = end.getMonth() + 1;
  let closingDate = dayInMonth(closeYear, closeMonth, closing_day);
  if (end > closingDate) {
    closeMonth += 1;
    if (closeMonth > 12) { closeMonth -= 12; closeYear += 1; }
    closingDate = dayInMonth(closeYear, closeMonth, closing_day);
  }
  let payYear = closeYear;
  let payMonth = closeMonth + pay_month_offset;
  while (payMonth > 12) { payMonth -= 12; payYear += 1; }
  return fmtYmd(dayInMonth(payYear, payMonth, pay_day));
}

async function main() {
  // 全催事 (売上の有無を問わない。未来の催事も含めて event_payments を作る)
  const { data: events } = await supabase
    .from("events")
    .select("id, venue, store_name, end_date, revenue, payer_master_id, force_direct")
    .order("end_date", { ascending: false });

  const targets = [];
  for (const e of events ?? []) {
    const { count } = await supabase
      .from("event_payments")
      .select("id", { count: "exact", head: true })
      .eq("event_id", e.id);
    if (count === 0) targets.push(e);
  }
  console.log(`売上ありで event_payments 無し: ${targets.length}件`);

  // venue_master / payer_master を全件キャッシュ
  const { data: venues } = await supabase
    .from("venue_master")
    .select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day, default_payer_id, direct_receive_rate, chouai_receive_rate");
  const { data: payers } = await supabase
    .from("payer_master")
    .select("id, name, closing_day, pay_month_offset, pay_day")
    .eq("is_active", true);

  let inserted = 0;
  let skipped = 0;
  let withRate = 0;
  let withoutRate = 0;

  for (const e of targets) {
    const vm = (venues ?? []).find((v) => v.venue_name === e.venue && (v.store_name ?? "") === (e.store_name ?? ""));
    if (!vm) {
      console.log(`  SKIP: ${e.venue} ${e.store_name || ""} (venue_master 無し)`);
      skipped++;
      continue;
    }

    // 入金元解決ロジック (resolvePaymentSource を簡易再実装)
    let cycle, appliedRate, venueMasterId, payerMasterId;
    if (e.payer_master_id) {
      const p = (payers ?? []).find((x) => x.id === e.payer_master_id);
      if (p) {
        cycle = { closing_day: p.closing_day, pay_month_offset: p.pay_month_offset, pay_day: p.pay_day };
        appliedRate = vm.chouai_receive_rate;
        venueMasterId = null;
        payerMasterId = p.id;
      }
    }
    if (!cycle && e.force_direct) {
      cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
      appliedRate = vm.direct_receive_rate;
      venueMasterId = vm.id;
      payerMasterId = null;
    }
    if (!cycle && vm.default_payer_id) {
      const p = (payers ?? []).find((x) => x.id === vm.default_payer_id);
      if (p) {
        cycle = { closing_day: p.closing_day, pay_month_offset: p.pay_month_offset, pay_day: p.pay_day };
        appliedRate = vm.chouai_receive_rate;
        venueMasterId = null;
        payerMasterId = p.id;
      }
    }
    if (!cycle) {
      cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
      appliedRate = vm.direct_receive_rate;
      venueMasterId = vm.id;
      payerMasterId = null;
    }

    const plannedDate = computePlannedPaymentDate(e.end_date, cycle);

    // 税抜売上を計算
    const { data: dailyData } = await supabase
      .from("event_daily_revenue")
      .select("amount, tax_type, tax_rate")
      .eq("event_id", e.id);
    let salesExcluded = 0;
    for (const d of dailyData ?? []) {
      if (d.tax_type === "excluded") salesExcluded += d.amount;
      else salesExcluded += Math.round(d.amount / (1 + (d.tax_rate ?? 0.08)));
    }

    // 入金率があれば金額計算、なければ null
    const plannedAmount = appliedRate != null && salesExcluded > 0
      ? Math.round((salesExcluded * appliedRate) / 100)
      : null;

    const insert = {
      event_id: e.id,
      venue_master_id: venueMasterId,
      payer_master_id: payerMasterId,
      planned_date: plannedDate,
      planned_amount: plannedAmount,
      planned_tax_type: "excluded",
      status: "予定",
      method: "transfer",
      applied_rate: appliedRate,
    };
    const { error } = await supabase.from("event_payments").insert(insert);
    if (error) {
      console.log(`  FAIL: ${e.venue} ${e.store_name || ""} → ${error.message}`);
      skipped++;
      continue;
    }
    inserted++;
    if (appliedRate != null) {
      withRate++;
      console.log(`  ✓ ${e.venue} ${e.store_name || ""} → 予定日:${plannedDate} 入金率:${appliedRate}% 金額:¥${plannedAmount?.toLocaleString()}`);
    } else {
      withoutRate++;
      console.log(`  ✓ ${e.venue} ${e.store_name || ""} → 予定日:${plannedDate} 入金率:未設定 (金額もnull・要設定)`);
    }
  }

  console.log("");
  console.log(`合計: 作成 ${inserted}件 / スキップ ${skipped}件`);
  console.log(`  内訳: 入金率あり ${withRate}件 / 入金率なし ${withoutRate}件`);
  if (withoutRate > 0) {
    console.log(`  → 入金率なしの催事は /venue-master で direct_receive_rate を設定してから、再度 /events/<id> 詳細画面で「このページを保存」すると planned_amount が自動補完されます`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
