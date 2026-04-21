"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";

export type PaymentAlertKind =
  | "missing_record"  // event_payments が1件も無い催事
  | "missing_setup"   // 開催前で予定日/予定額/入金率のいずれかが空
  | "no_sales"        // 終了済みで日別売上が1件も無い
  | "overdue";        // 予定日を過ぎても未入金（未回収）

export type PaymentAlertEvent = {
  id: string;
  name: string | null;
  venue: string;
  store_name: string | null;
  start_date: string;
  end_date: string;
};

export type PaymentAlerts = {
  missingRecord: PaymentAlertEvent[];
  missingSetup: PaymentAlertEvent[];
  noSales: PaymentAlertEvent[];
  overdue: PaymentAlertEvent[];
  total: number; // 催事ID の distinct 件数（バッジ用）
  loading: boolean;
};

const emptyAlerts: PaymentAlerts = {
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

    const missingRecord: PaymentAlertEvent[] = [];
    const missingSetup: PaymentAlertEvent[] = [];
    const noSales: PaymentAlertEvent[] = [];
    const overdue: PaymentAlertEvent[] = [];

    const hasAlertByEvent = new Set<string>();

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
        // 売上未入力
        if (!hasDaily.has(e.id)) {
          noSales.push(e);
          hasAlertByEvent.add(e.id);
        }
      }

      // 未回収: 予定日を過ぎて 入金済み・キャンセル以外
      for (const p of ps) {
        if (!p.planned_date) continue;
        if (p.planned_date < today && p.status !== "入金済" && p.status !== "キャンセル") {
          overdue.push(e);
          hasAlertByEvent.add(e.id);
          break; // 同じ催事で複数カウント防止
        }
      }
    }

    setState({
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
