// 特定の event の daily_revenue と events.revenue を確認
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const APP = "C:/Users/hirokazu/Documents/Claude/Projects/催事手配管理/app";
const envText = fs.readFileSync(path.join(APP, ".env.local"), "utf8");
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

const EVENT_ID = "fc3cb97b-d5c0-44de-a8e7-214521af43f7";

const { data: ev } = await supabase.from("events").select("*").eq("id", EVENT_ID).single();
console.log("=== event ===");
console.log(JSON.stringify({
  name: ev?.name,
  venue: ev?.venue,
  store_name: ev?.store_name,
  start_date: ev?.start_date,
  end_date: ev?.end_date,
  revenue: ev?.revenue,
}, null, 2));

const { data: daily } = await supabase
  .from("event_daily_revenue")
  .select("*")
  .eq("event_id", EVENT_ID)
  .order("date");
console.log("\n=== event_daily_revenue ===");
console.log(JSON.stringify(daily, null, 2));

// 合計計算 (税込)
const toIncluded = (n, r) => Math.round(n * (1 + r));
let totalIncluded = 0, totalExcluded = 0;
let paypayIncluded = 0, cashIncluded = 0;
for (const d of daily || []) {
  const n = d.amount ?? 0;
  const p = d.paypay_amount ?? 0;
  const c = n - p;
  if (d.tax_type === "excluded") {
    totalExcluded += n;
    totalIncluded += toIncluded(n, d.tax_rate);
    paypayIncluded += toIncluded(p, d.tax_rate);
    cashIncluded += toIncluded(c, d.tax_rate);
  } else {
    totalIncluded += n;
    totalExcluded += Math.round(n / (1 + d.tax_rate));
    paypayIncluded += p;
    cashIncluded += c;
  }
}
console.log("\n=== computed totals ===");
console.log("税抜合計:", totalExcluded);
console.log("税込合計:", totalIncluded);
console.log("うち現金(税込):", cashIncluded);
console.log("うちPayPay(税込):", paypayIncluded);
console.log("(events.revenue に保存されるべき値=税込合計):", totalIncluded);
console.log("(実際のevents.revenue):", ev?.revenue);
