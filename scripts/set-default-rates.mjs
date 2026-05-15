// venue_master.direct_receive_rate が null の百貨店を 80% にデフォルト設定し、
// そこに紐づく event_payments で applied_rate=null かつ planned_amount=null の行を
// 80% で再計算して埋める。1日二日イベントの現金持ち帰りなど例外は個別に調整。

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

const DEFAULT_RATE = 80;

async function main() {
  // STEP 0: 前回のスクリプトで planned_amount=0 になってしまった行を null に戻す
  // (売上未入力の催事を 0×rate=0 で埋めてしまったため)
  console.log(`=== STEP 0: planned_amount=0 の行を null に戻す (売上未入力ケース) ===`);
  const { data: zeroAmts } = await supabase
    .from("event_payments")
    .select("id, event_id")
    .eq("planned_amount", 0);
  let cleared = 0;
  for (const p of zeroAmts ?? []) {
    // この催事に売上が入っているか確認
    const { count: salesCount } = await supabase
      .from("event_daily_revenue")
      .select("id", { count: "exact", head: true })
      .eq("event_id", p.event_id);
    if ((salesCount ?? 0) === 0) {
      // 売上未入力 → 0 ではなく null が正しい
      await supabase.from("event_payments").update({ planned_amount: null }).eq("id", p.id);
      cleared++;
    }
  }
  console.log(`${cleared}件を null に戻しました`);
  console.log("");

  // STEP 1: venue_master の direct/chouai_receive_rate が null の百貨店を 80% に
  console.log(`=== STEP 1: venue_master.{direct,chouai}_receive_rate を ${DEFAULT_RATE}% にデフォルト設定 ===`);
  const { data: venues, error: vErr } = await supabase
    .from("venue_master")
    .select("id, venue_name, store_name, direct_receive_rate, chouai_receive_rate");
  if (vErr) { console.error(vErr); process.exit(1); }
  let touched = 0;
  for (const v of venues ?? []) {
    const update = {};
    if (v.direct_receive_rate == null) update.direct_receive_rate = DEFAULT_RATE;
    if (v.chouai_receive_rate == null) update.chouai_receive_rate = DEFAULT_RATE;
    if (Object.keys(update).length === 0) continue;
    const { error } = await supabase
      .from("venue_master")
      .update(update)
      .eq("id", v.id);
    if (error) {
      console.log(`  FAIL: ${v.venue_name} ${v.store_name || ""} → ${error.message}`);
    } else {
      const parts = [];
      if (update.direct_receive_rate != null) parts.push(`direct=${update.direct_receive_rate}`);
      if (update.chouai_receive_rate != null) parts.push(`chouai=${update.chouai_receive_rate}`);
      console.log(`  ✓ ${v.venue_name} ${v.store_name || ""}: ${parts.join(", ")}`);
      touched++;
    }
  }
  console.log(`合計 ${touched}件更新`);
  console.log("");

  // STEP 2: applied_rate=null かつ planned_amount=null の event_payments を補完
  console.log(`=== STEP 2: applied_rate=null の event_payments を venue_master の rate で補完 ===`);
  const { data: payments } = await supabase
    .from("event_payments")
    .select("id, event_id, venue_master_id, payer_master_id, planned_amount, planned_tax_type, applied_rate")
    .is("applied_rate", null);

  console.log(`対象 event_payments: ${payments?.length ?? 0}件`);
  if (!payments || payments.length === 0) { console.log("(なし)"); return; }

  // venue_master / payer_master を全件キャッシュ
  const { data: vmAll } = await supabase
    .from("venue_master")
    .select("id, venue_name, store_name, default_payer_id, direct_receive_rate, chouai_receive_rate");

  // 各 event_payments を補完
  let filled = 0;
  let skipped = 0;
  for (const p of payments) {
    // event を取得 (venue 解決と売上計算用)
    const { data: ev } = await supabase
      .from("events")
      .select("id, venue, store_name, payer_master_id, force_direct")
      .eq("id", p.event_id)
      .single();
    if (!ev) { skipped++; continue; }

    // venue 解決: event_payments.venue_master_id 優先、なければ events.venue + store_name で検索
    let vm = (vmAll ?? []).find((v) => v.id === p.venue_master_id);
    if (!vm) {
      vm = (vmAll ?? []).find((v) =>
        v.venue_name === ev.venue && (v.store_name ?? "") === (ev.store_name ?? ""));
    }
    if (!vm) {
      console.log(`  SKIP: ${ev.venue} ${ev.store_name || ""} (venue_master 解決失敗)`);
      skipped++;
      continue;
    }

    // rate 決定: 帳合経由なら chouai、直なら direct
    const isChouai = !!p.payer_master_id || (!!vm.default_payer_id && !ev.force_direct);
    const rate = isChouai ? vm.chouai_receive_rate : vm.direct_receive_rate;
    if (rate == null) {
      console.log(`  SKIP: ${ev.venue} ${ev.store_name || ""} (rate 取得不可)`);
      skipped++;
      continue;
    }

    // 売上 (税抜) を計算
    const { data: dailyData } = await supabase
      .from("event_daily_revenue")
      .select("amount, tax_type, tax_rate")
      .eq("event_id", ev.id);
    let salesExcluded = 0;
    let salesIncluded = 0;
    for (const d of dailyData ?? []) {
      if (d.tax_type === "excluded") {
        salesExcluded += d.amount;
        salesIncluded += Math.round(d.amount * (1 + (d.tax_rate ?? 0.08)));
      } else {
        salesIncluded += d.amount;
        salesExcluded += Math.round(d.amount / (1 + (d.tax_rate ?? 0.08)));
      }
    }

    // planned_amount は税抜ベースで計算 (planned_tax_type=excluded のため)
    const taxType = p.planned_tax_type ?? "excluded";
    const base = taxType === "excluded" ? salesExcluded : salesIncluded;
    // 売上未入力 (base=0) の場合は planned_amount を null のまま保つ
    const update = { applied_rate: rate };
    if (p.planned_amount == null && base > 0) {
      update.planned_amount = Math.round((base * rate) / 100);
    }

    const { error } = await supabase
      .from("event_payments")
      .update(update)
      .eq("id", p.id);
    if (error) {
      console.log(`  FAIL: ${ev.venue} ${ev.store_name || ""} → ${error.message}`);
      skipped++;
    } else {
      const amtStr = update.planned_amount != null ? `¥${update.planned_amount.toLocaleString()}` : "(売上未入力で金額もnull)";
      console.log(`  ✓ ${ev.venue} ${ev.store_name || ""} → rate:${rate}% 金額:${amtStr}`);
      filled++;
    }
  }

  console.log("");
  console.log(`合計: 補完 ${filled}件 / スキップ ${skipped}件`);
}

main().catch((e) => { console.error(e); process.exit(1); });
