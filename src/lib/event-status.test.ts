import { describe, it, expect } from "vitest";
import {
  diffDays, addDays, mailDeadline, daysToMailDeadline,
  isAwaitingMail, isPastEvent, isApplicationUrgent,
} from "./event-status";

describe("diffDays / addDays", () => {
  it("数える日数（to - from）", () => {
    expect(diffDays("2026-06-01", "2026-06-08")).toBe(7);
    expect(diffDays("2026-06-08", "2026-06-01")).toBe(-7);
    expect(diffDays("2026-06-30", "2026-07-01")).toBe(1); // 月またぎ
  });
  it("日付の加減算（月またぎ・負）", () => {
    expect(addDays("2026-06-25", 7)).toBe("2026-07-02");
    expect(addDays("2026-07-01", -7)).toBe("2026-06-24");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("投函期限（会期7日前）", () => {
  it("mailDeadline は会期開始の7日前", () => {
    expect(mailDeadline("2026-07-08")).toBe("2026-07-01");
    expect(mailDeadline("2026-07-08", 10)).toBe("2026-06-28");
  });
  it("daysToMailDeadline は残り日数（負＝超過）", () => {
    expect(daysToMailDeadline("2026-07-01", "2026-07-08")).toBe(0); // 今日が期限
    expect(daysToMailDeadline("2026-06-28", "2026-07-08")).toBe(3);
    expect(daysToMailDeadline("2026-07-05", "2026-07-08")).toBe(-4); // 超過
  });
});

describe("isAwaitingMail（投函待ち）", () => {
  it("印刷済みで会期がまだ終わっていなければ true", () => {
    expect(isAwaitingMail("印刷済み", "2026-07-13", "2026-07-01")).toBe(true);
    expect(isAwaitingMail("印刷済み", "2026-07-01", "2026-07-01")).toBe(true); // 当日(会期末=今日)も対象
  });
  it("投函済み・未印刷・会期終了済みは false", () => {
    expect(isAwaitingMail("投函済み", "2026-07-13", "2026-07-01")).toBe(false);
    expect(isAwaitingMail("校正中", "2026-07-13", "2026-07-01")).toBe(false);
    expect(isAwaitingMail("印刷済み", "2026-06-30", "2026-07-01")).toBe(false); // 会期終了
    expect(isAwaitingMail(null, "2026-07-13", "2026-07-01")).toBe(false);
  });
});

describe("isPastEvent", () => {
  it("終了ステータス or 会期末が過去なら true", () => {
    expect(isPastEvent("終了", "2026-12-31", "2026-07-01")).toBe(true);
    expect(isPastEvent("開催中", "2026-06-30", "2026-07-01")).toBe(true);
    expect(isPastEvent("開催中", "2026-07-01", "2026-07-01")).toBe(false); // 会期末=今日は現役
    expect(isPastEvent("準備中", "2026-08-01", "2026-07-01")).toBe(false);
  });
});

describe("isApplicationUrgent（出店申込書 要対応）", () => {
  const base = { submitted: false, status: "準備中", endDate: "2026-07-20", today: "2026-07-01" };
  it("未提出かつ会期開始まで0〜14日なら true", () => {
    expect(isApplicationUrgent({ ...base, startDate: "2026-07-10" })).toBe(true); // 9日後
    expect(isApplicationUrgent({ ...base, startDate: "2026-07-01" })).toBe(true); // 当日
    expect(isApplicationUrgent({ ...base, startDate: "2026-07-15" })).toBe(true); // 14日後
  });
  it("15日以上先・提出済・終了・過去は false", () => {
    expect(isApplicationUrgent({ ...base, startDate: "2026-07-16" })).toBe(false); // 15日後
    expect(isApplicationUrgent({ ...base, submitted: true, startDate: "2026-07-10" })).toBe(false);
    expect(isApplicationUrgent({ ...base, status: "終了", startDate: "2026-07-10" })).toBe(false);
    expect(isApplicationUrgent({ ...base, startDate: "2026-06-20", endDate: "2026-06-25" })).toBe(false); // 会期過去
  });
});
