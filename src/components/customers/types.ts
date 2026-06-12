/** 顧客・来場管理の共通型 */

export type Customer = {
  id: string;
  customer_no: string;
  name: string;
  kana: string | null;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  dm_active: boolean;
  notes: string | null;
  imported_at: string | null;
};

export type CustomerSegment = {
  customer_id: string;
  kbn_no: number;
  code: number;
};

export type SegmentMaster = {
  kbn_no: number;
  code: number;
  segment_name: string;
  venue_id: string | null;
};

export type EventLite = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
};

/** kbn_no と code から区分マスターを引くキー */
export function segKey(kbn_no: number, code: number): string {
  return `${kbn_no}-${code}`;
}

/** 顧客番号の比較用正規化（前後空白と先頭ゼロを除去） */
export function normalizeCustomerNo(no: string): string {
  const t = no.trim();
  const stripped = t.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/** 催事の表示ラベル */
export function eventLabel(e: EventLite): string {
  const period = `${e.start_date.slice(5).replace("-", "/")}〜${e.end_date.slice(5).replace("-", "/")}`;
  const store = e.store_name ? ` ${e.store_name}` : "";
  return `${e.start_date.slice(0, 4)}年 ${period} ${e.venue}${store}`;
}
