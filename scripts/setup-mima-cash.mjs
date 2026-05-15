// コスモスホール三間 の2催事を「現金持ち帰り」設定にして event_payments を作成
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
  // 対象催事
  const { data: events, error: evErr } = await supabase
    .from("events")
    .select("id, venue, store_name, start_date, end_date, revenue")
    .or("venue.eq.コスモスホール三間,venue.eq.三間イベント");
  if (evErr) { console.error(evErr); process.exit(1); }

  console.log(`対象催事: ${events?.length ?? 0}件`);

  for (const e of events ?? []) {
    const label = `${e.venue}${e.store_name ? " " + e.store_name : ""}`;
    console.log(`\n--- ${label} (${e.start_date}〜${e.end_date}) ---`);

    // is_cash_on_spot を ON
    const { error: flagErr } = await supabase
      .from("events")
      .update({ is_cash_on_spot: true })
      .eq("id", e.id);
    if (flagErr) {
      console.log(`  FAIL flag: ${flagErr.message}`);
      continue;
    }
    console.log(`  ✓ is_cash_on_spot = true`);

    // 既存 event_payments があるかチェック
    const { data: existing } = await supabase
      .from("event_payments")
      .select("id")
      .eq("event_id", e.id);

    const revenue = e.revenue ?? null;
    const cashFields = {
      method: "cash",
      status: revenue != null && revenue > 0 ? "入金済" : "予定",
      planned_date: e.end_date,
      planned_amount: revenue,
      planned_tax_type: "included",
      actual_date: revenue != null && revenue > 0 ? e.end_date : null,
      actual_amount: revenue,
      applied_rate: 100,
    };

    if (existing && existing.length > 0) {
      for (const p of existing) {
        const { error } = await supabase
          .from("event_payments")
          .update(cashFields)
          .eq("id", p.id);
        if (error) {
          console.log(`  FAIL update: ${error.message}`);
        } else {
          console.log(`  ✓ event_payments 更新: status=${cashFields.status}, planned_date=${cashFields.planned_date}, amount=${revenue ?? "(売上未入力)"}`);
        }
      }
    } else {
      const { error } = await supabase.from("event_payments").insert({
        event_id: e.id,
        venue_master_id: null,
        payer_master_id: null,
        notes: "現金持ち帰り",
        ...cashFields,
      });
      if (error) {
        console.log(`  FAIL insert: ${error.message}`);
      } else {
        console.log(`  ✓ event_payments 新規作成: status=${cashFields.status}, planned_date=${cashFields.planned_date}, amount=${revenue ?? "(売上未入力)"}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
