"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Printer, FileSpreadsheet } from "lucide-react";
import { downloadCsv } from "@/lib/csv";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import {
  CheckCircle2, AlertTriangle, XCircle, Undo2, UserSearch, ArrowLeft, UserCheck, StickyNote, QrCode,
} from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { EventCalendar } from "./EventCalendar";
import {
  eventLabel, normalizeCustomerNo,
  type Customer, type EventLite, type SegmentMaster,
} from "./types";

type Visit = {
  id: string;
  customer_id: string;
  created_at: string;
  notes: string | null;
  customers: Pick<Customer, "id" | "customer_no" | "name" | "kana" | "address"> | null;
};

type UndoLogRow = {
  id: string;
  customer_id: string;
  notes: string | null;
  deleted_at: string;
  customers: Pick<Customer, "customer_no" | "name"> | null;
};

type Feedback =
  | { kind: "ok"; customer: Customer; memo?: string }
  | { kind: "dup"; customer: Customer }
  | { kind: "notfound"; input: string }
  | { kind: "error"; message: string };

type Props = { segments: SegmentMaster[] };

export function VisitEntryTab({ segments }: Props) {
  // 来場登録は社員（viewer）がメインで入力する運用のため、admin/viewer とも入力可。
  // limited はページ自体にアクセス不可（lib/access.ts）。
  const { role, displayName } = usePermission();
  const canRegister = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<EventLite[]>([]);
  const [eventId, setEventId] = useState("");
  // select: 日程表から催事を選ぶ / entry: 番号を連続入力する
  const [step, setStep] = useState<"select" | "entry">("select");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [numberInput, setNumberInput] = useState("");
  // 番号で見つかった顧客。「登録しますか？」の確認待ち状態
  const [pending, setPending] = useState<Customer | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [candidates, setCandidates] = useState<Customer[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
  // QR読み取りモード: USBのQRリーダー（番号+Enterをキー入力）で読んだら、
  // 確認カードを出さずに即登録する（番号は確実なので連続スキャン向き）。
  const [qrMode, setQrMode] = useState(false);
  useEffect(() => {
    try { setQrMode(localStorage.getItem("visit_qr_mode") === "1"); } catch { /* ignore */ }
  }, []);
  const toggleQrMode = () => {
    setQrMode((v) => {
      const nv = !v;
      try { localStorage.setItem("visit_qr_mode", nv ? "1" : "0"); } catch { /* ignore */ }
      return nv;
    });
    setTimeout(() => numberRef.current?.focus(), 0);
  };
  // 各顧客の全催事累計来場回数（この催事の来場一覧に載っている顧客のみ）
  // 「来場回数」ソートと、常連バッジ表示に使う
  const [customerTotalVisits, setCustomerTotalVisits] = useState<Map<string, number>>(new Map());
  // 印刷時の列数（多い方が1枚に多く載る。3列がバランス良く既定）
  const [printCols, setPrintCols] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem("visit_print_cols") || "3", 10);
      return v >= 1 && v <= 6 ? v : 3;
    } catch { return 3; }
  });
  const changePrintCols = (n: number) => {
    setPrintCols(n);
    try { localStorage.setItem("visit_print_cols", String(n)); } catch { /* ignore */ }
  };
  // 来場一覧の並べ替え
  type VisitSortKey = "created" | "no" | "name" | "kana" | "count";
  const [visitSort, setVisitSort] = useState<{ key: VisitSortKey; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const toggleVisitSort = (key: VisitSortKey) =>
    setVisitSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "count" || key === "created" ? "desc" : "asc" }
    );
  // 選択中の催事にひも付いたDM区分名（DMハガキ画面で設定したもの）
  const [eventSegNames, setEventSegNames] = useState<string[]>([]);
  // この催事のDM名簿の人数（名簿CSVをDMハガキ画面で取込済みの場合）
  const [rosterCount, setRosterCount] = useState(0);
  // 確認待ちの顧客が名簿に載っているか（null = 名簿未取込で照合不可）
  const [pendingInRoster, setPendingInRoster] = useState<boolean | null>(null);
  // 確認カードで一緒に入力する来場メモ（任意）
  const [pendingMemo, setPendingMemo] = useState("");
  // 来場メモの編集中の行とテキスト（登録後の修正用）
  const [memoVisitId, setMemoVisitId] = useState<string | null>(null);
  const [memoText, setMemoText] = useState("");
  // カレンダー表示用: 催事ID → 来場数・名簿数（集計ビューから取得）
  const [eventStats, setEventStats] = useState<Map<string, { visits: number; roster: number }>>(new Map());
  // この催事で最近取り消した来場記録（誤操作の復元用）
  const [undoLog, setUndoLog] = useState<UndoLogRow[]>([]);
  const numberRef = useRef<HTMLInputElement>(null);

  // 催事一覧（新しい順）
  useEffect(() => {
    supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, end_date, dm_count")
      .order("start_date", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        const list = (data as EventLite[]) || [];
        setEvents(list);
        // デフォルトは「開始済みで最も新しい催事」（= 直近に終わった/開催中の催事）
        const today = new Date().toISOString().slice(0, 10);
        const def = list.find((e) => e.start_date <= today) || list[0];
        if (def) setEventId(def.id);
      });
  }, [supabase]);

  // 来場登録は「終わった催事への入力」が主なので、開催中→過去の順に並べ、
  // まだ始まっていない催事はリストの最後に回す
  const eventItems: ComboboxItem[] = useMemo(() => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const started = events.filter((e) => e.start_date <= todayStr); // 取得時点で新しい順
    const upcoming = events.filter((e) => e.start_date > todayStr).slice().reverse(); // 近い順
    return [
      ...started.map((e) => ({
        value: e.id,
        label: eventLabel(e),
        group: e.start_date.slice(0, 4) + "年",
      })),
      ...upcoming.map((e) => ({
        value: e.id,
        label: eventLabel(e),
        group: "今後の催事",
      })),
    ];
  }, [events]);

  const selectedEvent = events.find((e) => e.id === eventId) || null;

  const fetchVisits = useCallback(async (evtId: string) => {
    if (!evtId) { setVisits([]); return; }
    const { data } = await supabase
      .from("event_visits")
      .select("id, customer_id, created_at, notes, customers(id, customer_no, name, kana, address)")
      .eq("event_id", evtId)
      .order("created_at", { ascending: false })
      .limit(1000);
    setVisits((data as unknown as Visit[]) || []);
  }, [supabase]);

  const fetchUndoLog = useCallback(async (evtId: string) => {
    if (!evtId) { setUndoLog([]); return; }
    const { data } = await supabase
      .from("event_visit_undo_log")
      .select("id, customer_id, notes, deleted_at, customers(customer_no, name)")
      .eq("event_id", evtId)
      .order("deleted_at", { ascending: false })
      .limit(10);
    setUndoLog((data as unknown as UndoLogRow[]) || []);
  }, [supabase]);

  useEffect(() => {
    fetchVisits(eventId);
    fetchUndoLog(eventId);
  }, [eventId, fetchVisits, fetchUndoLog]);

  // 来場一覧に載っている顧客の「全催事累計来場回数」を取得
  // → ソート「来場回数順」と各行の 累計N回 表示に使う
  useEffect(() => {
    if (visits.length === 0) { setCustomerTotalVisits(new Map()); return; }
    const uniqueIds = Array.from(new Set(visits.map((v) => v.customer_id)));
    // Supabaseの in() は数百件までは問題なく通る。念のためチャンク分割
    const CHUNK = 300;
    (async () => {
      const counts = new Map<string, number>();
      for (let i = 0; i < uniqueIds.length; i += CHUNK) {
        const chunk = uniqueIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("event_visits")
          .select("customer_id")
          .in("customer_id", chunk);
        for (const row of (data as { customer_id: string }[]) || []) {
          counts.set(row.customer_id, (counts.get(row.customer_id) || 0) + 1);
        }
      }
      setCustomerTotalVisits(counts);
    })();
  }, [visits, supabase]);

  /** 現在の並べ替え順で来場記録を CSV(BOM付きUTF-8) としてダウンロード。
   * BOM付きなので Excel でダブルクリックすれば文字化けなく開ける。 */
  const exportExcel = () => {
    if (!selectedEvent) return;
    const rows: (string | number | null)[][] = [];
    // ヘッダ行
    rows.push([
      "顧客番号", "氏名", "カナ", "住所",
      "累計来場回数", "来場登録日時", "この回のメモ",
    ]);
    for (const v of sortedVisits) {
      const c = v.customers;
      rows.push([
        c?.customer_no || "",
        c?.name || "",
        c?.kana || "",
        c?.address || "",
        customerTotalVisits.get(v.customer_id) || 0,
        v.created_at?.slice(0, 19).replace("T", " ") || "",
        v.notes || "",
      ]);
    }
    const venue = selectedEvent.venue + (selectedEvent.store_name ? `_${selectedEvent.store_name}` : "");
    const date = selectedEvent.start_date;
    // ファイル名にコロン等使えないので置換
    const safe = venue.replace(/[\\/:*?"<>|]/g, "_");
    downloadCsv(`来場記録_${safe}_${date}.csv`, rows);
  };

  // 並べ替え適用後の来場一覧
  const sortedVisits = useMemo(() => {
    const dir = visitSort.dir === "asc" ? 1 : -1;
    return [...visits].sort((a, b) => {
      let r = 0;
      switch (visitSort.key) {
        case "created":
          r = a.created_at.localeCompare(b.created_at);
          break;
        case "no":
          r = (a.customers?.customer_no || "").localeCompare(
            b.customers?.customer_no || "",
            "ja",
            { numeric: true }
          );
          break;
        case "name":
          r = (a.customers?.name || "").localeCompare(b.customers?.name || "", "ja");
          break;
        case "kana":
          r = (a.customers?.kana || "").localeCompare(b.customers?.kana || "", "ja");
          break;
        case "count":
          r = (customerTotalVisits.get(a.customer_id) || 0) - (customerTotalVisits.get(b.customer_id) || 0);
          break;
      }
      return r * dir;
    });
  }, [visits, visitSort, customerTotalVisits]);

  // カレンダー用の集計（来場数・名簿数）。選択画面に戻るたびに最新化
  useEffect(() => {
    if (step !== "select") return;
    Promise.all([
      supabase.from("event_visit_counts").select("event_id, visit_count"),
      supabase.from("event_roster_counts").select("event_id, roster_count"),
    ]).then(([vRes, rRes]) => {
      const m = new Map<string, { visits: number; roster: number }>();
      for (const r of (vRes.data as { event_id: string; visit_count: number }[]) || []) {
        m.set(r.event_id, { visits: r.visit_count, roster: 0 });
      }
      for (const r of (rRes.data as { event_id: string; roster_count: number }[]) || []) {
        const cur = m.get(r.event_id) || { visits: 0, roster: 0 };
        cur.roster = r.roster_count;
        m.set(r.event_id, cur);
      }
      setEventStats(m);
    });
  }, [step, supabase]);

  // 催事にひも付いたDM区分名と名簿人数を取得
  useEffect(() => {
    if (!eventId) { setEventSegNames([]); setRosterCount(0); return; }
    supabase
      .from("event_dm_segments")
      .select("kbn_no, code")
      .eq("event_id", eventId)
      .then(({ data }) => {
        const names = ((data as { kbn_no: number; code: number }[]) || []).map((l) => {
          const seg = segments.find((s) => s.kbn_no === l.kbn_no && s.code === l.code);
          // 区分コード（区5-114 など）と区分名の両方を表示する
          const code = `区${l.kbn_no}-${l.code}`;
          return seg ? `${code} ${seg.segment_name}` : code;
        });
        setEventSegNames(names);
      });
    supabase
      .from("event_dm_recipients")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .then(({ count }) => setRosterCount(count ?? 0));
  }, [eventId, supabase, segments]);

  /** 催事を選んで入力画面へ */
  const goEntry = (id: string) => {
    setEventId(id);
    setStep("entry");
    setFeedback(null);
    setPending(null);
    setCandidates([]);
    setNumberInput("");
  };

  /** 入力画面から催事選択に戻る */
  const backToSelect = () => {
    setStep("select");
    setFeedback(null);
    setPending(null);
    setCandidates([]);
    setNumberInput("");
    setNameQuery("");
  };

  /** 来場を登録する（確認カードのメモも一緒に保存。重複は警告） */
  const register = useCallback(async (customer: Customer) => {
    if (!eventId) return;
    const memo = pendingMemo.trim();
    const { error } = await supabase
      .from("event_visits")
      .insert({ event_id: eventId, customer_id: customer.id, notes: memo || null });
    if (error) {
      if (error.code === "23505") {
        setFeedback({ kind: "dup", customer });
      } else {
        setFeedback({ kind: "error", message: error.message });
      }
    } else {
      setFeedback({ kind: "ok", customer, memo: memo || undefined });
      fetchVisits(eventId);
    }
    setPending(null);
    setPendingInRoster(null);
    setPendingMemo("");
    setCandidates([]);
    setNameResults([]);
    setNameQuery("");
    setNumberInput("");
    // 状態更新が反映された後にフォーカスを番号入力へ戻す
    setTimeout(() => numberRef.current?.focus(), 0);
  }, [eventId, supabase, fetchVisits, pendingMemo]);

  /** 番号で顧客を探して確認待ちにする（ゼロ埋め違いも許容） */
  const lookup = useCallback(async () => {
    const raw = numberInput.trim();
    if (!raw || !eventId || busy) return;
    setBusy(true);
    setFeedback(null);
    setCandidates([]);
    setPending(null);
    try {
      // まず完全一致
      const { data: exact } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_no", raw)
        .limit(2);
      let found = (exact as Customer[]) || [];
      // 見つからなければ先頭ゼロの違いを許容して検索
      if (found.length === 0 && /^\d+$/.test(raw)) {
        const stripped = normalizeCustomerNo(raw);
        const { data: fuzzy } = await supabase
          .from("customers")
          .select("*")
          .like("customer_no", `%${stripped}`)
          .limit(20);
        found = ((fuzzy as Customer[]) || []).filter(
          (c) => normalizeCustomerNo(c.customer_no) === stripped
        );
      }
      let foundPending = false;
      if (found.length === 0) {
        setFeedback({ kind: "notfound", input: raw });
        setNumberInput("");
      } else if (found.length === 1) {
        foundPending = true;
        // QR読み取りモード: 番号は確実なので確認カードを出さず即登録（連続スキャン向き）
        if (qrMode) {
          await register(found[0]);
          return;
        }
        // 名簿CSVを取込済みなら「この催事の名簿に載っているか」を照合
        let inRoster: boolean | null = null;
        if (rosterCount > 0) {
          const { data: r } = await supabase
            .from("event_dm_recipients")
            .select("id")
            .eq("event_id", eventId)
            .eq("customer_id", found[0].id)
            .limit(1);
          inRoster = ((r as { id: string }[]) || []).length > 0;
        }
        setPendingInRoster(inRoster);
        // 確認待ちへ（Enterで登録 / Escでやり直し）
        setPending(found[0]);
      } else {
        // 同一番号とみなせる顧客が複数 → 選んでもらう
        setCandidates(found);
      }
      // 確認カードが出るときはメモ欄にフォーカスが移るので番号欄には戻さない
      if (!foundPending) setTimeout(() => numberRef.current?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }, [numberInput, eventId, busy, supabase, rosterCount, qrMode, register]);

  // 確認カード表示中は、フォーカスがどこにあっても Enter=登録 / Esc=やめる を効かせる
  // （入力欄のフォーカス頼みだと環境によって2回目のEnterが落ちるため、画面全体で受ける）
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Enter") {
        e.preventDefault();
        register(pending);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setPending(null);
        setPendingMemo("");
        setNumberInput("");
        setTimeout(() => numberRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, register]);

  /** 名前・カナで検索（ハガキ忘れの方の調査用） */
  useEffect(() => {
    const q = nameQuery.trim();
    if (q.length < 2) { setNameResults([]); return; }
    const timer = setTimeout(async () => {
      const esc = q.replace(/[%,]/g, "");
      const { data } = await supabase
        .from("customers")
        .select("*")
        .or(`name.ilike.%${esc}%,kana.ilike.%${esc}%`)
        .limit(20);
      setNameResults((data as Customer[]) || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [nameQuery, supabase]);

  const undoVisit = async (visit: Visit) => {
    // スマホでの誤タップ防止に確認を挟む
    const name = visit.customers?.name ?? "この方";
    if (!window.confirm(`${name} 様の来場記録を取り消しますか？`)) return;
    // 復元できるように、何を消したかをログに残してから削除する
    await supabase.from("event_visit_undo_log").insert({
      event_id: eventId,
      customer_id: visit.customer_id,
      notes: visit.notes,
      deleted_by: displayName || null,
    });
    await supabase.from("event_visits").delete().eq("id", visit.id);
    fetchVisits(eventId);
    fetchUndoLog(eventId);
  };

  /** 誤って取り消した来場記録を復元する */
  const restoreVisit = async (log: UndoLogRow) => {
    const { error } = await supabase
      .from("event_visits")
      .insert({ event_id: eventId, customer_id: log.customer_id, notes: log.notes });
    // 23505 = すでに登録済み（再入力などで復元済み）→ ログだけ片付ける
    if (!error || error.code === "23505") {
      await supabase.from("event_visit_undo_log").delete().eq("id", log.id);
      fetchVisits(eventId);
      fetchUndoLog(eventId);
    }
  };

  /** 来場メモ（「今回5箱購入・発送依頼」など、その回だけの記録）を保存 */
  const saveMemo = async () => {
    if (!memoVisitId) return;
    await supabase
      .from("event_visits")
      .update({ notes: memoText.trim() || null })
      .eq("id", memoVisitId);
    setMemoVisitId(null);
    setMemoText("");
    fetchVisits(eventId);
  };

  const customerRow = (c: Customer, action: React.ReactNode) => (
    <div key={c.id} className="flex items-center gap-3 px-3 py-2 border rounded-md">
      <span className="font-mono text-xs text-muted-foreground shrink-0">#{c.customer_no}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{c.name}</div>
        <div className="text-xs text-muted-foreground truncate">{c.address || c.kana || ""}</div>
      </div>
      {action}
    </div>
  );

  /* ============ 画面1: 日程表から催事を選ぶ ============ */
  if (step === "select") {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label>催事（百貨店）をクリックすると番号入力に進みます</Label>
            <div className="max-w-2xl mx-auto">
              <EventCalendar events={events} selectedId={eventId} onSelect={goEntry} stats={eventStats} />
            </div>
            <div className="flex flex-col md:flex-row gap-1 md:items-center justify-center pt-1">
              <span className="text-xs text-muted-foreground shrink-0">検索して選ぶ場合：</span>
              <Combobox
                items={eventItems}
                value={eventId}
                onChange={(v) => { if (v) goEntry(v); }}
                placeholder="会場名などで検索"
                searchPlaceholder="会場名などで検索"
                allowCustom={false}
                className="max-w-md"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ============ 画面2: 番号を連続入力 ============ */
  return (
    <div className="space-y-4">
      {/* 選択中の催事ヘッダー */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" onClick={backToSelect} className="shrink-0">
              <ArrowLeft className="h-4 w-4 mr-1" />
              催事を選び直す
            </Button>
            {selectedEvent && (
              <div className="flex-1 min-w-0">
                <div className="font-semibold flex items-baseline gap-2 flex-wrap">
                  <span>{selectedEvent.venue}{selectedEvent.store_name ? ` ${selectedEvent.store_name}` : ""}</span>
                  {selectedEvent.dm_count != null && (
                    <span className="text-xs font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
                      DM {selectedEvent.dm_count.toLocaleString()}枚
                    </span>
                  )}
                  {eventSegNames.map((n) => (
                    <span key={n} className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      {n}
                    </span>
                  ))}
                  {rosterCount > 0 && (
                    <span className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      名簿 {rosterCount.toLocaleString()}人
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {selectedEvent.start_date}〜{selectedEvent.end_date}
                  ／ 登録済みの来場: {visits.length}人
                  {(() => {
                    const base = selectedEvent.dm_count || rosterCount;
                    return base ? `（DMヒット率 ${((visits.length / base) * 100).toFixed(1)}%）` : "";
                  })()}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {canRegister ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-base font-semibold">
                お客様番号を入力／QRリーダーで読み取り（Enter）
              </Label>
              <button
                type="button"
                onClick={toggleQrMode}
                title="USBのQRリーダーで読み取ったら、確認カードを出さずにそのまま登録します"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                  qrMode ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-300 hover:bg-muted"
                }`}
              >
                <QrCode className="h-4 w-4" />
                QR即登録 {qrMode ? "ON" : "OFF"}
              </button>
            </div>
            {qrMode && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 max-w-xl">
                <QrCode className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  QR即登録モード：下の欄にカーソルを置いたまま、ハガキのQRをリーダーで読み取ると<span className="font-semibold">確認なしでそのまま来場登録</span>します。連続でスキャンできます。
                  手入力で確認したい時は OFF にしてください。
                </span>
              </div>
            )}
            <Input
              ref={numberRef}
              value={numberInput}
              onChange={(e) => { setNumberInput(e.target.value); setPending(null); }}
              onKeyDown={(e) => {
                // 日本語入力の変換確定Enterには反応しない
                if (e.nativeEvent.isComposing) return;
                // 確認カード表示中のキー操作は画面全体のリスナーが処理する
                if (pending) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (!busy) lookup();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setNumberInput("");
                }
              }}
              inputMode="numeric"
              autoFocus
              placeholder="ハガキ宛名面の番号"
              disabled={!eventId}
              className="max-w-sm h-14 text-2xl font-mono tracking-wider"
            />

            {/* 確認待ち: 登録しますか？ */}
            {pending && (
              <div className="rounded-md bg-blue-50 border-2 border-blue-300 px-4 py-3 max-w-xl">
                <div className="flex items-start gap-2">
                  <UserCheck className="h-6 w-6 mt-0.5 shrink-0 text-blue-700" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xl text-blue-900">{pending.name} 様</div>
                    <div className="text-sm text-blue-800">
                      #{pending.customer_no}
                      {pending.kana ? ` ／ ${pending.kana}` : ""}
                    </div>
                    {pending.address && (
                      <div className="text-xs text-blue-800/80 truncate">{pending.address}</div>
                    )}
                    {pending.notes && (
                      <div className="mt-1 text-sm font-medium text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1">
                        📌 顧客メモ: {pending.notes}
                      </div>
                    )}
                    {pendingInRoster === false && (
                      <div className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        この催事のDM名簿には見つかりません。番号やハガキの催事名を確認してください（このまま登録もできます）
                      </div>
                    )}
                    <div className="mt-2">
                      <Input
                        value={pendingMemo}
                        onChange={(e) => setPendingMemo(e.target.value)}
                        autoFocus
                        placeholder="メモ（任意）例: 5箱購入・発送依頼"
                        className="h-9 bg-white max-w-md"
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-blue-900">この方を来場登録しますか？</span>
                      <Button size="sm" onClick={() => register(pending)}>
                        登録する（Enter）
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setPending(null); setPendingMemo(""); setNumberInput(""); numberRef.current?.focus(); }}
                      >
                        やめる（Esc）
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 直前の結果フィードバック */}
            {feedback?.kind === "ok" && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-green-800 max-w-xl">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-lg">{feedback.customer.name} 様を登録しました</div>
                  <div className="text-xs">#{feedback.customer.customer_no} {feedback.customer.address || ""}</div>
                  {feedback.memo && <div className="text-xs mt-0.5">📝 メモ: {feedback.memo}</div>}
                </div>
              </div>
            )}
            {feedback?.kind === "dup" && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 max-w-xl">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">{feedback.customer.name} 様はこの催事に登録済みです</div>
                  <div className="text-xs">#{feedback.customer.customer_no}</div>
                </div>
              </div>
            )}
            {feedback?.kind === "notfound" && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800 max-w-xl">
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">番号「{feedback.input}」の顧客が見つかりません</div>
                  <div className="text-xs">番号を確かめるか、下の名前検索で探してください</div>
                </div>
              </div>
            )}
            {feedback?.kind === "error" && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800 max-w-xl">
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="text-sm">登録に失敗しました: {feedback.message}</div>
              </div>
            )}

            {/* 同一番号に複数候補がある場合 */}
            {candidates.length > 0 && (
              <div className="space-y-1.5 max-w-xl">
                <div className="text-sm text-amber-700">該当が複数います。登録する方を選んでください：</div>
                {candidates.map((c) =>
                  customerRow(c, <Button size="sm" onClick={() => register(c)}>登録</Button>)
                )}
              </div>
            )}

            {/* 名前検索（ハガキ忘れ対応） */}
            <div className="pt-2 border-t space-y-2">
              <Label className="flex items-center gap-1.5 text-muted-foreground">
                <UserSearch className="h-4 w-4" />
                ハガキ忘れの方は名前・カナで検索
              </Label>
              <Input
                value={nameQuery}
                onChange={(e) => setNameQuery(e.target.value)}
                placeholder="例: 山田 / ヤマダ（2文字以上）"
                className="max-w-sm"
              />
              {nameResults.length > 0 && (
                <div className="space-y-1.5 max-h-72 overflow-y-auto max-w-xl">
                  {nameResults.map((c) =>
                    customerRow(c, <Button size="sm" onClick={() => register(c)}>登録</Button>)
                  )}
                </div>
              )}
              {nameQuery.trim().length >= 2 && nameResults.length === 0 && (
                <div className="text-xs text-muted-foreground">該当なし</div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            来場登録の権限がありません
          </CardContent>
        </Card>
      )}

      {/* 最近取り消した記録（誤操作の復元用） */}
      {eventId && canRegister && undoLog.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="font-medium text-amber-800">最近取り消した記録（押し間違いはここから復元できます）</div>
            <div className="space-y-1.5">
              {undoLog.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-3 py-1.5 border border-amber-200 bg-amber-50/50 rounded-md">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    #{l.customers?.customer_no ?? "?"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{l.customers?.name ?? "（削除された顧客）"}</span>
                    {l.notes && <span className="ml-2 text-xs text-muted-foreground">📝 {l.notes}</span>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:inline">
                    {l.deleted_at.slice(5, 16).replace("T", " ")} 取消
                  </span>
                  <Button size="sm" variant="outline" onClick={() => restoreVisit(l)}>
                    復元
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* この催事の来場一覧 */}
      {eventId && visits.length > 0 && (
        <Card className="visit-print-zone">
          {/* 印刷用スタイル: この Card だけを A4 縦に印刷。他のUIは隠す。
              段組数は printCols を反映（動的に style タグを再生成） */}
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 8mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              nav, aside, header, footer { display: none !important; }
              main, [data-slot="main"] { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
              .md\\:pl-60 { padding-left: 0 !important; }
              [role="tablist"] { display: none !important; }
              /* 来場一覧カードを全画面に (Card の overflow-hidden も解除) */
              .visit-print-zone {
                position: absolute !important;
                left: 0 !important; top: 0 !important; right: 0 !important;
                width: 100% !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                z-index: 9999 !important;
                overflow: visible !important;
                display: block !important;
                padding: 0 !important;
              }
              .visit-print-zone [data-slot="card-content"],
              .visit-print-zone > div {
                overflow: visible !important;
                padding: 0 !important;
                display: block !important;
              }
              /* 段組で1ページに多く載せる (balance モードで自動配分) */
              .visit-print-zone .visit-print-scroll {
                display: block !important;
                max-height: none !important;
                overflow: visible !important;
                column-count: ${printCols} !important;
                column-gap: 3mm !important;
                column-rule: 1px dotted #ddd;
              }
              /* space-y-1.5 の margin-top を無効化 (段組内で妙な余白になるため) */
              .visit-print-zone .visit-print-scroll > * {
                margin-top: 0 !important;
              }
              .visit-print-zone .print-hide { display: none !important; }
              .visit-print-zone .print-title { display: block !important; }
              .visit-print-zone [data-visit-row] {
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                display: block !important;
                width: 100% !important;
                margin: 0 0 1px 0 !important;
                padding: 1px 4px !important;
                border: 1px solid #ccc !important;
                border-radius: 2px !important;
                font-size: ${printCols >= 4 ? 9 : printCols >= 3 ? 10 : 11}px !important;
                line-height: 1.35 !important;
                background: white !important;
              }
              /* 各行内のフレックス配置を維持しつつコンパクトに */
              .visit-print-zone [data-visit-row] > div {
                gap: 4px !important;
              }
              /* 累計バッジは小さく */
              .visit-print-zone [data-visit-row] .rounded-full {
                padding: 0 4px !important;
                font-size: ${printCols >= 4 ? 8 : 9}px !important;
              }
              /* この回のメモは 折返し許容で 段組みでも読める大きさに */
              .visit-print-zone [data-visit-row] .bg-amber-50 {
                margin-top: 1px !important;
                padding: 1px 4px !important;
                font-size: ${printCols >= 4 ? 8 : 9}px !important;
              }
            }
          `}</style>
          <CardContent className="pt-4 space-y-2">
            {/* 印刷用タイトル (通常時は非表示) */}
            <div className="print-title hidden mb-2">
              <div className="border-b pb-1 mb-2">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h2 className="text-base font-bold">
                    来場記録
                    {selectedEvent && (
                      <span className="ml-2 text-sm">
                        （{selectedEvent.venue}{selectedEvent.store_name ? ` ${selectedEvent.store_name}` : ""}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {selectedEvent.start_date}〜{selectedEvent.end_date}
                        </span>
                        ）
                      </span>
                    )}
                  </h2>
                  <span className="text-[10px] text-muted-foreground">
                    {sortedVisits.length}件 / 並べ替え: {
                      visitSort.key === "created" ? "入力順" :
                      visitSort.key === "no" ? "顧客番号" :
                      visitSort.key === "name" ? "氏名" :
                      visitSort.key === "kana" ? "カナ" :
                      "来場回数"
                    }（{visitSort.dir === "asc" ? "昇順" : "降順"}） / 印刷 {new Date().toLocaleString("ja-JP")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap print-hide">
              <div className="font-medium">
                この催事の来場記録
                <span className="ml-2 text-xs text-muted-foreground">
                  {visits.length}件
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* 印刷段組数セレクタ (A4縦・現在の設定で何列に段組するか) */}
                <div className="inline-flex items-center gap-1 rounded-md border bg-white px-1.5 py-0.5">
                  <span className="text-[10px] text-muted-foreground">印刷</span>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => changePrintCols(n)}
                      className={`w-6 h-6 rounded text-[11px] font-bold transition-colors ${
                        printCols === n
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      title={`${n}列で印刷（1ページに ${n === 1 ? "少なく" : n <= 3 ? "しっかり" : "たくさん"}）`}
                    >
                      {n}
                    </button>
                  ))}
                  <span className="text-[10px] text-muted-foreground">列</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportExcel}
                  title="現在の並べ替え順でExcel(CSV)ファイルをダウンロード"
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" />Excel出力
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  title={`現在の並べ替え順で印刷（A4 縦・${printCols}列）`}
                >
                  <Printer className="h-4 w-4 mr-1" />印刷
                </Button>
              </div>
            </div>
            {/* 並べ替えピル */}
            <div className="flex items-center gap-1.5 flex-wrap print-hide">
              <span className="text-xs font-bold text-muted-foreground inline-flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />並べ替え:
              </span>
              {([
                { key: "created", label: "入力順" },
                { key: "no", label: "顧客番号" },
                { key: "name", label: "氏名" },
                { key: "kana", label: "カナ" },
                { key: "count", label: "来場回数" },
              ] as { key: VisitSortKey; label: string }[]).map((opt) => {
                const isSel = visitSort.key === opt.key;
                const Icon = !isSel ? ArrowUpDown : visitSort.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleVisitSort(opt.key)}
                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-bold transition-all ${
                      isSel
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-white text-foreground border-input hover:bg-muted hover:border-primary/40"
                    }`}
                    title={isSel ? `${opt.label}（クリックで${visitSort.dir === "asc" ? "降順" : "昇順"}に切替）` : `${opt.label}で並べ替え`}
                    aria-pressed={isSel}
                  >
                    {opt.label}
                    <Icon className="h-3 w-3" />
                  </button>
                );
              })}
            </div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto visit-print-scroll">
              {sortedVisits.map((v) => {
                const totalVisits = customerTotalVisits.get(v.customer_id) || 0;
                return (
                <div key={v.id} data-visit-row className="px-3 py-1.5 border rounded-md">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      #{v.customers?.customer_no ?? "?"}
                    </span>
                    <span className="flex-1 truncate font-medium">{v.customers?.name ?? "（削除された顧客）"}</span>
                    {totalVisits > 1 && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                          totalVisits >= 3
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-blue-100 text-blue-800 border-blue-200"
                        }`}
                        title={totalVisits >= 3 ? "常連（3回以上ご来場）" : `累計${totalVisits}回`}
                      >
                        {totalVisits >= 3 && "★"}累計{totalVisits}回
                      </span>
                    )}
                    {canRegister && (
                      <span className="print-hide inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPending(null); // 確認カードと同時編集でEnterが衝突しないように
                            if (memoVisitId === v.id) {
                              setMemoVisitId(null);
                            } else {
                              setMemoVisitId(v.id);
                              setMemoText(v.notes || "");
                            }
                          }}
                          title="この来場のメモ（購入内容・発送依頼など）"
                        >
                          <StickyNote className={`h-4 w-4 ${v.notes ? "text-amber-600" : "text-muted-foreground"}`} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => undoVisit(v)} title="取消">
                          <Undo2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </span>
                    )}
                  </div>
                  {v.notes && memoVisitId !== v.id && (
                    <div className="mt-1 ml-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {v.notes}
                    </div>
                  )}
                  {memoVisitId === v.id && (
                    <div className="mt-1.5 flex gap-2">
                      <Input
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.nativeEvent.isComposing) return;
                          if (e.key === "Enter") { e.preventDefault(); saveMemo(); }
                          if (e.key === "Escape") { e.preventDefault(); setMemoVisitId(null); }
                        }}
                        placeholder="例: 5箱購入・東京へ発送依頼"
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button size="sm" onClick={saveMemo}>保存</Button>
                      <Button size="sm" variant="outline" onClick={() => setMemoVisitId(null)}>やめる</Button>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
