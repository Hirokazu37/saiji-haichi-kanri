// 締日跨ぎの既存催事 event_payments を分割する。
// venue/payer の closing_day を見て、催事期間が締日を跨いでいたら
// 1行を複数行に分割し、それぞれ period_start_date / period_end_date /
// installment_no / installment_total / planned_date / planned_amount を計算。

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

// payment-cycle.ts の関数を簡易再実装
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
function computePaymentSplits(eventStart, eventEnd, cycle) {
  const start = parseYmd(eventStart);
  const end = parseYmd(eventEnd);
  if (!start || !end || start > end) return [];
  const { closing_day } = cycle;
  if (closing_day == null) {
    return [{ periodStart: eventStart, periodEnd: eventEnd, closingDate: eventEnd, plannedDate: null }];
  }
  const closingDates = [];
  let cy = start.getFullYear();
  let cm = start.getMonth() + 1;
  let c = dayInMonth(cy, cm, closing_day);
  if (c < start) {
    cm += 1; if (cm > 12) { cm -= 12; cy += 1; }
    c = dayInMonth(cy, cm, closing_day);
  }
  while (c <= end) {
    closingDates.push(c);
    cm += 1; if (cm > 12) { cm -= 12; cy += 1; }
    c = dayInMonth(cy, cm, closing_day);
  }
  const splits = [];
  let ps = new Date(start);
  for (const cd of closingDates) {
    if (cd >= end) break;
    splits.push({
      periodStart: fmtYmd(ps),
      periodEnd: fmtYmd(cd),
      closingDate: fmtYmd(cd),
      plannedDate: computePlannedPaymentDate(fmtYmd(cd), cycle),
    });
    ps = new Date(cd);
    ps.setDate(ps.getDate() + 1);
  }
  if (ps <= end) {
    splits.push({
      periodStart: fmtYmd(ps),
      periodEnd: fmtYmd(end),
      closingDate: fmtYmd(end),
      plannedDate: computePlannedPaymentDate(fmtYmd(end), cycle),
    });
  }
  return splits;
}

async function main() {
  // event_payments を全件取得 (events 関連付き)
  const { data: payments } = await supabase
    .from("event_payments")
    .select("id, event_id, venue_master_id, payer_master_id, planned_date, planned_amount, planned_tax_type, applied_rate, status, actual_date, actual_amount, method, installment_no, installment_total, events(id, venue, store_name, start_date, end_date)");
  console.log(`event_payments: ${payments?.length ?? 0} 件`);

  // venue/payer マスター
  const { data: venues } = await supabase
    .from("venue_master")
    .select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day");
  const { data: payers } = await supabase
    .from("payer_master")
    .select("id, name, closing_day, pay_month_offset, pay_day");

  // 催事ID → 既存 payments 配列 のグループ化
  const byEvent = new Map();
  for (const p of payments ?? []) {
    if (!byEvent.has(p.event_id)) byEvent.set(p.event_id, []);
    byEvent.get(p.event_id).push(p);
  }

  let splitCount = 0;
  let unchanged = 0;

  for (const [eventId, ps] of byEvent.entries()) {
    // 既に複数行ある催事はスキップ (手動で設定済みの可能性)
    if (ps.length > 1) {
      unchanged++;
      continue;
    }
    const p = ps[0];
    const ev = p.events;
    if (!ev) { unchanged++; continue; }

    // サイクル取得 (payer 優先、なければ venue)
    let cycle = null;
    if (p.payer_master_id) {
      const py = (payers ?? []).find((x) => x.id === p.payer_master_id);
      if (py) cycle = { closing_day: py.closing_day, pay_month_offset: py.pay_month_offset, pay_day: py.pay_day };
    }
    if (!cycle && p.venue_master_id) {
      const vm = (venues ?? []).find((x) => x.id === p.venue_master_id);
      if (vm) cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
    }
    if (!cycle) { unchanged++; continue; }

    // 分割計算
    const splits = computePaymentSplits(ev.start_date, ev.end_date, cycle);
    if (splits.length <= 1) { unchanged++; continue; }

    // 日別売上を取得して期間別合計
    const { data: dailyData } = await supabase
      .from("event_daily_revenue")
      .select("date, amount, tax_type, tax_rate")
      .eq("event_id", eventId);
    const dailyByDate = new Map();
    for (const d of dailyData ?? []) {
      dailyByDate.set(d.date, d);
    }

    const sumExcluded = (start, end) => {
      let total = 0;
      let cur = parseYmd(start);
      const last = parseYmd(end);
      while (cur && last && cur <= last) {
        const ymd = fmtYmd(cur);
        const d = dailyByDate.get(ymd);
        if (d) {
          if (d.tax_type === "excluded") total += d.amount;
          else total += Math.round(d.amount / (1 + (d.tax_rate ?? 0.08)));
        }
        cur.setDate(cur.getDate() + 1);
      }
      return total;
    };

    const total = splits.length;
    const label = `${ev.venue}${ev.store_name ? " " + ev.store_name : ""} (${ev.start_date}〜${ev.end_date})`;
    console.log(`\n--- ${label}: ${total}回に分割 ---`);

    // 1番目の split は既存行を UPDATE、2番目以降は INSERT
    const rate = p.applied_rate;
    for (let i = 0; i < total; i++) {
      const s = splits[i];
      const periodSales = sumExcluded(s.periodStart, s.periodEnd);
      const amount = rate != null && periodSales > 0 ? Math.round((periodSales * rate) / 100) : null;
      const fields = {
        period_start_date: s.periodStart,
        period_end_date: s.periodEnd,
        installment_no: i + 1,
        installment_total: total,
        planned_date: s.plannedDate,
        planned_amount: amount,
      };
      if (i === 0) {
        const { error } = await supabase
          .from("event_payments")
          .update(fields)
          .eq("id", p.id);
        if (error) console.log(`  FAIL update #${i + 1}: ${error.message}`);
        else console.log(`  ✓ #1/${total} ${s.periodStart}〜${s.periodEnd} → ${s.plannedDate} 金額:${amount != null ? `¥${amount.toLocaleString()}` : "(未計算)"}`);
      } else {
        const { error } = await supabase.from("event_payments").insert({
          event_id: eventId,
          venue_master_id: p.venue_master_id,
          payer_master_id: p.payer_master_id,
          planned_tax_type: p.planned_tax_type,
          applied_rate: p.applied_rate,
          status: "予定",
          method: p.method,
          ...fields,
        });
        if (error) console.log(`  FAIL insert #${i + 1}: ${error.message}`);
        else console.log(`  ✓ #${i + 1}/${total} ${s.periodStart}〜${s.periodEnd} → ${s.plannedDate} 金額:${amount != null ? `¥${amount.toLocaleString()}` : "(未計算)"}`);
      }
    }
    splitCount++;
  }

  console.log("");
  console.log(`合計: 分割した催事 ${splitCount}件 / 変化なし ${unchanged}件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
