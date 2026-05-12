"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";

export type PaymentAlertKind =
  | "recently_sales_pending"   // 終了から14日以内、日別売上が空
  | "recently_amount_pending"  // 終了から14日以内、売上はあるが入金予定額が空
  | "missing_record"           // event_payments が1件も無い催事
  | "missing_setup"            // 開催前で予定日/予定額/入金率のいずれかが空
  | "no_sales"                 // 15日以上前に終了済みで日別売上が1件も無い
  | "overdue";                 // 予定日を過ぎても未入金（未回収）

export type PaymentAlertEvent = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
  daysSinceEnd?: number; // 終了からの経過日数（直近終了アラート用）
};

export type PaymentAlerts = {
  recentlySalesPending: PaymentAlertEvent[];
  recentlyAmountPending: PaymentAlertEvent[];
  missingRecord: PaymentAlertEvent[];
  missingSetup: PaymentAlertEvent[];
  noSales: PaymentAlertEvent[];
  overdue: PaymentAlertEvent[];
  total: number; // 催事ID の distinct 件数（バッジ用）
  loading: boolean;
};

const RECENT_WINDOW_DAYS = 14;

const emptyAlerts: PaymentAlerts = {
  recentlySalesPending: [],
  recentlyAmountPending: [],
  missingRecord: [],
  missingSetup: [],
  noSales: [],
  overdue: [],
  total: 0,
  loading: true,
};

export function usePaymentAlerts(): PaymentAlerts {
  const { canViewPayments, loading: permLoading } = usePermission();
  const [state, setState] = useState<PaymentAlerts>(emptyAlerts);

  const compute = useCallback(async () => {
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);

    // 1. 対象期間の催事（過去半年〜未来半年）
    const halfYearAgo = new Date();
    halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
    const halfYearLater = new Date();
    halfYearLater.setMonth(halfYearLater.getMonth() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const [evtRes, payRes, dailyRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, name, venue, store_name, start_date, end_date")
        .gte("start_date", fmt(halfYearAgo))
        .lte("start_date", fmt(halfYearLater))
        .order("start_date", { ascending: false }),
      supabase
        .from("event_payments")
        .select("id, event_id, planned_date, planned_amount, applied_rate, status"),
      supabase
        .from("event_daily_revenue")
        .select("event_id"),
    ]);

    const events = (evtRes.data || []) as PaymentAlertEvent[];
    const payments = (payRes.data || []) as {
      id: string; event_id: string;
      planned_date: string | null; planned_amount: number | null;
      applied_rate: number | null; status: string;
    }[];
    const dailies = (dailyRes.data || []) as { event_id: string }[];

    const paymentsByEvent = new Map<string, typeof payments>();
    for (const p of payments) {
      const arr = paymentsByEvent.get(p.event_id) ?? [];
      arr.push(p);
      paymentsByEvent.set(p.event_id, arr);
    }
    const hasDaily = new Set<string>();
    for (const d of dailies) hasDaily.add(d.event_id);

    const recentlySalesPending: PaymentAlertEvent[] = [];
    const recentlyAmountPending: PaymentAlertEvent[] = [];
    const missingRecord: PaymentAlertEvent[] = [];
    const missingSetup: PaymentAlertEvent[] = [];
    const noSales: PaymentAlertEvent[] = [];
    const overdue: PaymentAlertEvent[] = [];

    const hasAlertByEvent = new Set<string>();

    const todayDate = new Date(today);

    for (const e of events) {
      const ps = paymentsByEvent.get(e.id) ?? [];
      const isBeforeOrDuring = e.end_date >= today; // 開催前 or 開催中
      const isFinished = e.end_date < today;

      // 入金レコード無し
      if (ps.length === 0) {
        missingRecord.push(e);
        hasAlertByEvent.add(e.id);
      }

      // 開催前後で切替
      if (isBeforeOrDuring) {
        // 設定不足: いずれかが空
        const anyMissing = ps.some(
          (p) => p.planned_date == null || p.planned_amount == null || p.applied_rate == null,
        );
        if (ps.length > 0 && anyMissing) {
          missingSetup.push(e);
          hasAlertByEvent.add(e.id);
        }
      } else if (isFinished) {
        // 終了からの日数
        const [y, m, d] = e.end_date.split("-").map(Number);
        const endDate = new Date(y, (m || 1) - 1, d || 1);
        const daysSinceEnd = Math.max(0, Math.floor((todayDate.getTime() - endDate.getTime()) / 86400000));
        const isRecent = daysSinceEnd <= RECENT_WINDOW_DAYS;
        const hasSales = hasDaily.has(e.id);
        const enriched: PaymentAlertEvent = { ...e, daysSinceEnd };

        if (!hasSales) {
          // 売上未入力
          if (isRecent) {
            recentlySalesPending.push(enriched);
          } else {
            noSales.push(e);
          }
          hasAlertByEvent.add(e.id);
        } else if (isRecent) {
          // 売上はあるが入金予定額が空（直近終了の催事のみ「アクション促し」として出す）
          const hasMissingAmount = ps.some((p) => p.planned_amount == null);
          if (hasMissingAmount) {
            recentlyAmountPending.push(enriched);
            hasAlertByEvent.add(e.id);
          }
        }
      }

      // 未回収: 予定日を過ぎて まだ「予定」状態のもの
      // 「保留」「キャンセル」「入金済」は意図的に外したステータスなのでアラートしない
      for (const p of ps) {
        if (!p.planned_date) continue;
        if (p.planned_date < today && p.status === "予定") {
          overdue.push(e);
          hasAlertByEvent.add(e.id);
          break; // 同じ催事で複数カウント防止
        }
      }
    }

    // 直近終了は日数の浅い順（新しく終わった催事ほど上）に並べる
    recentlySalesPending.sort((a, b) => (a.daysSinceEnd ?? 0) - (b.daysSinceEnd ?? 0));
    recentlyAmountPending.sort((a, b) => (a.daysSinceEnd ?? 0) - (b.daysSinceEnd ?? 0));

    setState({
      recentlySalesPending,
      recentlyAmountPending,
      missingRecord,
      missingSetup,
      noSales,
      overdue,
      total: hasAlertByEvent.size,
      loading: false,
    });
  }, []);

  useEffect(() => {
    if (permLoading) return;
    if (!canViewPayments) {
      setState({ ...emptyAlerts, loading: false });
      return;
    }
    compute();
  }, [permLoading, canViewPayments, compute]);

  return state;
}
