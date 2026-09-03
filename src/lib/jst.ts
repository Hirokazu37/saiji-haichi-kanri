// 日本時間 (JST = UTC+9) 表示ヘルパー。
// Supabase の timestamptz は UTC で保存されるので、そのまま `.slice(0, 16)` などで
// 切り出すと 9時間ズレて表示される。以下のヘルパーで JST に変換してから表示する。

/** "2026-09-03 13:11" (JST) 形式 */
export function jstDateTimeMinute(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

/** "2026-09-03 13:11:22" (JST) 形式 */
export function jstDateTimeSecond(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

/** "2026-09-03" (JST) 形式 */
export function jstDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

/** "09/03 13:11" (JST・短縮) 形式 - スペースが限られる場面向け */
export function jstShortDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}
