// 催事の終了日 + 振込サイクル（締め日・支払月・支払日）から
// 入金予定日を計算する

export type PaymentCycle = {
  closing_day?: number | null;      // 0=月末, 1-31=日付
  pay_month_offset?: number | null; // 1=翌月, 2=翌々月
  pay_day?: number | null;          // 0=月末, 1-31=日付
};

// その月の末日
function endOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0); // month は1-12、0日付で前月末＝実月末
}

// 指定月の specified day（月末クランプ込み）
function dayInMonth(year: number, month: number, day: number): Date {
  if (day === 0) return endOfMonth(year, month);
  const last = endOfMonth(year, month).getDate();
  const d = Math.min(day, last);
  return new Date(year, month - 1, d);
}

function fmtYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * 入金予定日を計算する
 *
 * @param eventEnd 催事の終了日（YYYY-MM-DD）
 * @param cycle   振込サイクル（締め日・支払月・支払日）
 * @returns       入金予定日（YYYY-MM-DD）。計算できなければ null
 *
 * 計算ロジック:
 * 1. 催事終了日を基準に、その月（または次月）の「締め日」を確定
 * 2. その締め月から pay_month_offset ヶ月後の「支払日」が入金予定日
 *
 * 例:
 *   - 阪急（月末締め、翌月15日）で 4/25 終了 → 4/30 締め → 5/15 支払
 *   - 大丸（20日締め、翌々月19日）で 4/25 終了 → 5/20 締め → 7/19 支払
 *   - 鶴屋（月末締め、翌月15日）で 4/5 終了 → 4/30 締め → 5/15 支払
 */
export function computePlannedPaymentDate(
  eventEnd: string,
  cycle: PaymentCycle,
): string | null {
  const end = parseYmd(eventEnd);
  if (!end) return null;
  const { closing_day, pay_month_offset, pay_day } = cycle;
  if (closing_day == null || pay_month_offset == null || pay_day == null) return null;

  // 1. 催事終了日を含む or 直後の「締め日」を探す
  let closeYear = end.getFullYear();
  let closeMonth = end.getMonth() + 1; // 1-12
  let closingDate = dayInMonth(closeYear, closeMonth, closing_day);
  // 終了日が当月の締め日より後なら、次月の締め日に進める
  if (end > closingDate) {
    closeMonth += 1;
    if (closeMonth > 12) { closeMonth -= 12; closeYear += 1; }
    closingDate = dayInMonth(closeYear, closeMonth, closing_day);
  }

  // 2. 締め月から pay_month_offset ヶ月後の pay_day が支払日
  let payYear = closeYear;
  let payMonth = closeMonth + pay_month_offset;
  while (payMonth > 12) { payMonth -= 12; payYear += 1; }
  const payDate = dayInMonth(payYear, payMonth, pay_day);
  return fmtYmd(payDate);
}

// 催事 + 百貨店マスター + 帳合先マスターから、入金元と適用サイクル・率を解決する
export type PaymentSourceResolution = {
  kind: "direct" | "payer" | "none";         // direct=百貨店直取引, payer=帳合経由
  venueMasterId: string | null;
  payerMasterId: string | null;
  cycle: PaymentCycle;                         // 適用される振込サイクル
  appliedRate: number | null;                  // 税抜入金率%（null=未設定）
  displayLabel: string;                        // UI表示用のラベル
};

type EventInput = {
  payer_master_id?: string | null;
  force_direct?: boolean;
};
type VenueInput = {
  id: string;
  venue_name?: string;
  store_name?: string | null;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
  default_payer_id: string | null;
  direct_receive_rate: number | null;
  chouai_receive_rate: number | null;
};
type PayerInput = {
  id: string;
  name: string;
  closing_day: number | null;
  pay_month_offset: number | null;
  pay_day: number | null;
};

export function resolvePaymentSource(
  event: EventInput,
  venue: VenueInput | null,
  payers: PayerInput[],
): PaymentSourceResolution {
  // 1. 催事に payer_master_id が明示されていればそれを使う
  if (event.payer_master_id) {
    const p = payers.find((x) => x.id === event.payer_master_id);
    if (p) {
      return {
        kind: "payer",
        venueMasterId: null,
        payerMasterId: p.id,
        cycle: {
          closing_day: p.closing_day,
          pay_month_offset: p.pay_month_offset,
          pay_day: p.pay_day,
        },
        // 帳合経由扱いなので百貨店の chouai_receive_rate を使う
        appliedRate: venue?.chouai_receive_rate ?? null,
        displayLabel: `帳合経由: ${p.name}`,
      };
    }
  }

  // 2. force_direct が true なら百貨店直取引（帳合先を無視）
  if (event.force_direct) {
    return {
      kind: "direct",
      venueMasterId: venue?.id ?? null,
      payerMasterId: null,
      cycle: {
        closing_day: venue?.closing_day ?? null,
        pay_month_offset: venue?.pay_month_offset ?? null,
        pay_day: venue?.pay_day ?? null,
      },
      appliedRate: venue?.direct_receive_rate ?? null,
      displayLabel: venue ? `直取引: ${venue.venue_name}${venue.store_name ? " " + venue.store_name : ""}` : "直取引",
    };
  }

  // 3. 催事に明示が無い場合、百貨店マスターの default_payer_id に従う
  if (venue?.default_payer_id) {
    const p = payers.find((x) => x.id === venue.default_payer_id);
    if (p) {
      return {
        kind: "payer",
        venueMasterId: null,
        payerMasterId: p.id,
        cycle: {
          closing_day: p.closing_day,
          pay_month_offset: p.pay_month_offset,
          pay_day: p.pay_day,
        },
        appliedRate: venue.chouai_receive_rate ?? null,
        displayLabel: `帳合経由: ${p.name}（百貨店設定）`,
      };
    }
  }

  // 4. default が無い、または venue なしは百貨店直取引相当
  if (venue) {
    return {
      kind: "direct",
      venueMasterId: venue.id,
      payerMasterId: null,
      cycle: {
        closing_day: venue.closing_day,
        pay_month_offset: venue.pay_month_offset,
        pay_day: venue.pay_day,
      },
      appliedRate: venue.direct_receive_rate ?? null,
      displayLabel: `直取引: ${venue.venue_name}${venue.store_name ? " " + venue.store_name : ""}`,
    };
  }

  return {
    kind: "none",
    venueMasterId: null,
    payerMasterId: null,
    cycle: { closing_day: null, pay_month_offset: null, pay_day: null },
    appliedRate: null,
    displayLabel: "未設定",
  };
}

// サイクル情報を人間可読な文字列にフォーマット（マスター画面表示用）
export function formatPaymentCycle(cycle: PaymentCycle): string {
  const { closing_day, pay_month_offset, pay_day } = cycle;
  if (closing_day == null || pay_month_offset == null || pay_day == null) return "未設定";
  const closingLabel = closing_day === 0 ? "月末" : `${closing_day}日`;
  const offsetLabel =
    pay_month_offset === 0 ? "当月" :
    pay_month_offset === 1 ? "翌月" :
    pay_month_offset === 2 ? "翌々月" :
    `${pay_month_offset}ヶ月後`;
  const payLabel = pay_day === 0 ? "月末" : `${pay_day}日`;
  return `${closingLabel}締め ${offsetLabel}${payLabel}`;
}
