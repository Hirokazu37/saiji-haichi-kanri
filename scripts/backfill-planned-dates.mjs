// event_payments で planned_date が null になっている行を、
// 現在の venue_master / payer_master のサイクル設定で再計算して埋める。
//
// 経緯: 催事作成時に venue_master のサイクルが未設定だと planned_date=null で
// レコードが作られ、後でマスターを更新しても再計算されない。

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

// payment-cycle.ts の computePlannedPaymentDate を再実装
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
  // planned_date が null の event_payments を取得
  const { data: payments, error } = await supabase
    .from("event_payments")
    .select("id, event_id, venue_master_id, payer_master_id, planned_date, status, events(id, venue, store_name, end_date)")
    .is("planned_date", null)
    .neq("status", "キャンセル");
  if (error) { console.error(error); process.exit(1); }

  console.log(`対象 event_payments: ${payments?.length ?? 0}件`);
  if (!payments || payments.length === 0) return;

  const { data: venues } = await supabase
    .from("venue_master")
    .select("id, venue_name, store_name, closing_day, pay_month_offset, pay_day");
  const { data: payers } = await supabase
    .from("payer_master")
    .select("id, name, closing_day, pay_month_offset, pay_day");

  let filled = 0;
  let skipped = 0;

  for (const p of payments) {
    const ev = p.events;
    if (!ev || !ev.end_date) { skipped++; continue; }

    // サイクル解決: payer_master 優先、なければ venue_master
    let cycle = null;
    let cycleSource = "";
    if (p.payer_master_id) {
      const py = (payers ?? []).find((x) => x.id === p.payer_master_id);
      if (py) {
        cycle = { closing_day: py.closing_day, pay_month_offset: py.pay_month_offset, pay_day: py.pay_day };
        cycleSource = `帳合:${py.name}`;
      }
    }
    if (!cycle && p.venue_master_id) {
      const vm = (venues ?? []).find((x) => x.id === p.venue_master_id);
      if (vm) {
        cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
        cycleSource = `直取引:${vm.venue_name}${vm.store_name ? " " + vm.store_name : ""}`;
      }
    }
    // venue_master_id が null の場合: events.venue + store_name で逆引き
    if (!cycle) {
      const vm = (venues ?? []).find((x) =>
        x.venue_name === ev.venue && (x.store_name ?? "") === (ev.store_name ?? ""));
      if (vm) {
        cycle = { closing_day: vm.closing_day, pay_month_offset: vm.pay_month_offset, pay_day: vm.pay_day };
        cycleSource = `直取引(逆引):${vm.venue_name}${vm.store_name ? " " + vm.store_name : ""}`;
      }
    }

    if (!cycle) {
      console.log(`  SKIP: ${ev.venue} ${ev.store_name || ""} (サイクル取得不可)`);
      skipped++;
      continue;
    }

    const planned = computePlannedPaymentDate(ev.end_date, cycle);
    if (!planned) {
      console.log(`  SKIP: ${ev.venue} ${ev.store_name || ""} (${cycleSource} closing/offset/pay_day いずれかが未設定)`);
      skipped++;
      continue;
    }

    const { error: upErr } = await supabase
      .from("event_payments")
      .update({ planned_date: planned })
      .eq("id", p.id);
    if (upErr) {
      console.log(`  FAIL: ${ev.venue} ${ev.store_name || ""} → ${upErr.message}`);
      skipped++;
      continue;
    }
    console.log(`  ✓ ${ev.venue} ${ev.store_name || ""} (催事終了 ${ev.end_date}) → 予定日 ${planned} (${cycleSource})`);
    filled++;
  }

  console.log("");
  console.log(`合計: 補完 ${filled}件 / スキップ ${skipped}件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
