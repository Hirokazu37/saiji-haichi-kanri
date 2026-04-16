/**
 * 日本の祝日を計算するユーティリティ
 * 2016年〜2030年の祝日に対応
 */

/** 第N月曜日を取得 */
function getNthMonday(year: number, month: number, n: number): number {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstMonday = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
  return firstMonday + (n - 1) * 7;
}

/** 春分の日の近似計算 */
function getVernalEquinox(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 秋分の日の近似計算 */
function getAutumnalEquinox(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** 指定年の祝日マップを返す (キー: "YYYY-MM-DD", 値: 祝日名) */
export function getJapaneseHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const fmt = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // 固定祝日
  holidays.set(fmt(1, 1), "元日");
  holidays.set(fmt(2, 11), "建国記念の日");
  holidays.set(fmt(2, 23), "天皇誕生日");
  holidays.set(fmt(4, 29), "昭和の日");
  holidays.set(fmt(5, 3), "憲法記念日");
  holidays.set(fmt(5, 4), "みどりの日");
  holidays.set(fmt(5, 5), "こどもの日");
  holidays.set(fmt(8, 11), "山の日");
  holidays.set(fmt(11, 3), "文化の日");
  holidays.set(fmt(11, 23), "勤労感謝の日");

  // ハッピーマンデー制度
  holidays.set(fmt(1, getNthMonday(year, 1, 2)), "成人の日");
  holidays.set(fmt(7, getNthMonday(year, 7, 3)), "海の日");
  holidays.set(fmt(9, getNthMonday(year, 9, 3)), "敬老の日");
  holidays.set(fmt(10, getNthMonday(year, 10, 2)), "スポーツの日");

  // 春分・秋分
  holidays.set(fmt(3, getVernalEquinox(year)), "春分の日");
  holidays.set(fmt(9, getAutumnalEquinox(year)), "秋分の日");

  // 振替休日: 祝日が日曜日の場合、翌月曜日が振替休日
  const entries = Array.from(holidays.entries());
  for (const [dateStr, name] of entries) {
    const date = new Date(dateStr + "T00:00:00");
    if (date.getDay() === 0) {
      // 翌日以降で祝日でない最初の平日を振替休日にする
      let next = new Date(date);
      next.setDate(next.getDate() + 1);
      while (holidays.has(next.toISOString().slice(0, 10))) {
        next.setDate(next.getDate() + 1);
      }
      holidays.set(next.toISOString().slice(0, 10), `振替休日（${name}）`);
    }
  }

  // 国民の休日: 2つの祝日に挟まれた平日は休日
  const sortedDates = Array.from(holidays.keys()).sort();
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const d1 = new Date(sortedDates[i] + "T00:00:00");
    const d2 = new Date(sortedDates[i + 1] + "T00:00:00");
    const diff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 2) {
      const between = new Date(d1);
      between.setDate(between.getDate() + 1);
      const betweenStr = between.toISOString().slice(0, 10);
      if (!holidays.has(betweenStr) && between.getDay() !== 0) {
        holidays.set(betweenStr, "国民の休日");
      }
    }
  }

  return holidays;
}

/** 複数年にまたがる祝日マップを一括取得 */
export function getHolidaysForRange(years: number[]): Map<string, string> {
  const merged = new Map<string, string>();
  const uniqueYears = [...new Set(years)];
  for (const y of uniqueYears) {
    const h = getJapaneseHolidays(y);
    h.forEach((v, k) => merged.set(k, v));
  }
  return merged;
}
