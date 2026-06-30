// 催事の日付・期限・ステータスに関する純粋関数。
// 画面コンポーネントから切り出してユニットテスト可能にしたもの。

/** YYYY-MM-DD 同士の日数差（to - from）。負なら from が後。 */
export function diffDays(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + "T00:00:00").getTime();
  const b = new Date(toYmd + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

/** YYYY-MM-DD に n 日加算（n は負も可）。 */
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** DMの投函目安：会期開始の何日前までに投函するか（既定7日前）。 */
export const DM_MAIL_LEAD_DAYS = 7;

/** 投函期限の日付（会期開始の lead 日前）。 */
export function mailDeadline(startDate: string, lead = DM_MAIL_LEAD_DAYS): string {
  return addDays(startDate, -lead);
}

/** 投函期限まであと何日（負＝超過）。 */
export function daysToMailDeadline(today: string, startDate: string, lead = DM_MAIL_LEAD_DAYS): number {
  return diffDays(today, mailDeadline(startDate, lead));
}

/** 投函待ち：印刷済みだが未投函で、会期がまだ終わっていない（end_date≧今日）。 */
export function isAwaitingMail(dmStatus: string | null, endDate: string, today: string): boolean {
  return dmStatus === "印刷済み" && endDate >= today;
}

/** 終了済み（履歴側に回す）：ステータスが「終了」か、会期末が今日より前。 */
export function isPastEvent(status: string, endDate: string, today: string): boolean {
  return status === "終了" || endDate < today;
}

/** 出店申込書の「要対応」：未提出かつ終了でなく、会期開始まで0〜14日。 */
export function isApplicationUrgent(p: {
  submitted: boolean;
  status: string;
  startDate: string;
  endDate: string;
  today: string;
}): boolean {
  if (p.submitted || p.status === "終了") return false;
  if (p.endDate < p.today) return false;
  const ds = diffDays(p.today, p.startDate);
  return ds >= 0 && ds <= 14;
}
