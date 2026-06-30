import { describe, it, expect } from "vitest";
import { computePlannedPaymentDate, computePaymentSplits, formatPaymentCycle } from "./payment-cycle";

describe("computePlannedPaymentDate", () => {
  it("月末締め・翌月15日（阪急型）: 4/25終了 → 5/15", () => {
    expect(computePlannedPaymentDate("2026-04-25", { closing_day: 0, pay_month_offset: 1, pay_day: 15 })).toBe("2026-05-15");
  });
  it("20日締め・翌々月19日（大丸型）: 4/25終了 → 7/19", () => {
    expect(computePlannedPaymentDate("2026-04-25", { closing_day: 20, pay_month_offset: 2, pay_day: 19 })).toBe("2026-07-19");
  });
  it("月末締め・翌月15日: 4/5終了 → 5/15（当月締めに収まる）", () => {
    expect(computePlannedPaymentDate("2026-04-05", { closing_day: 0, pay_month_offset: 1, pay_day: 15 })).toBe("2026-05-15");
  });
  it("サイクル未設定なら null", () => {
    expect(computePlannedPaymentDate("2026-04-25", { closing_day: null, pay_month_offset: 1, pay_day: 15 })).toBeNull();
  });
});

describe("computePaymentSplits（締日跨ぎ＝月またぎの分割）", () => {
  it("20日締めで 4/18〜4/25 は2分割される", () => {
    const splits = computePaymentSplits("2026-04-18", "2026-04-25", { closing_day: 20, pay_month_offset: 1, pay_day: 15 });
    expect(splits.length).toBe(2);
    expect(splits[0].periodStart).toBe("2026-04-18");
    expect(splits[0].periodEnd).toBe("2026-04-20");
    expect(splits[1].periodStart).toBe("2026-04-21");
    expect(splits[1].periodEnd).toBe("2026-04-25");
  });
  it("締日を跨がない催事は1区間", () => {
    const splits = computePaymentSplits("2026-04-21", "2026-04-25", { closing_day: 20, pay_month_offset: 1, pay_day: 15 });
    expect(splits.length).toBe(1);
    expect(splits[0].periodStart).toBe("2026-04-21");
    expect(splits[0].periodEnd).toBe("2026-04-25");
  });
  it("月末締めで月をまたぐ 1/28〜2/3 は2分割", () => {
    const splits = computePaymentSplits("2026-01-28", "2026-02-03", { closing_day: 0, pay_month_offset: 1, pay_day: 15 });
    expect(splits.length).toBe(2);
    expect(splits[0].periodEnd).toBe("2026-01-31");
    expect(splits[1].periodStart).toBe("2026-02-01");
  });
  it("closing_day 未設定なら分割せず1区間", () => {
    const splits = computePaymentSplits("2026-04-18", "2026-04-25", { closing_day: null, pay_month_offset: 1, pay_day: 15 });
    expect(splits.length).toBe(1);
  });
});

describe("formatPaymentCycle", () => {
  it("読みやすい表記にする", () => {
    expect(formatPaymentCycle({ closing_day: 0, pay_month_offset: 1, pay_day: 15 })).toBe("月末締め 翌月15日");
    expect(formatPaymentCycle({ closing_day: 20, pay_month_offset: 2, pay_day: 0 })).toBe("20日締め 翌々月月末");
    expect(formatPaymentCycle({ closing_day: null, pay_month_offset: null, pay_day: null })).toBe("未設定");
  });
});
