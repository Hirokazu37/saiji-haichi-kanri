"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { CheckCircle2, AlertTriangle, XCircle, Undo2, UserSearch } from "lucide-react";
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
  customers: Pick<Customer, "id" | "customer_no" | "name" | "kana" | "address"> | null;
};

type Feedback =
  | { kind: "ok"; customer: Customer }
  | { kind: "dup"; customer: Customer }
  | { kind: "notfound"; input: string }
  | { kind: "error"; message: string };

type Props = { segments: SegmentMaster[] };

export function VisitEntryTab({}: Props) {
  // 来場登録は社員（viewer）がメインで入力する運用のため、admin/viewer とも入力可。
  // limited はページ自体にアクセス不可（lib/access.ts）。
  const { role } = usePermission();
  const canRegister = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<EventLite[]>([]);
  const [eventId, setEventId] = useState("");
  const [visits, setVisits] = useState<Visit[]>([]);
  const [numberInput, setNumberInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [candidates, setCandidates] = useState<Customer[]>([]);
  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<Customer[]>([]);
  const [busy, setBusy] = useState(false);
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
      .select("id, customer_id, created_at, customers(id, customer_no, name, kana, address)")
      .eq("event_id", evtId)
      .order("created_at", { ascending: false })
      .limit(1000);
    setVisits((data as unknown as Visit[]) || []);
  }, [supabase]);

  useEffect(() => { fetchVisits(eventId); }, [eventId, fetchVisits]);

  /** 来場を登録する（重複は警告） */
  const register = useCallback(async (customer: Customer) => {
    if (!eventId) return;
    const { error } = await supabase
      .from("event_visits")
      .insert({ event_id: eventId, customer_id: customer.id });
    if (error) {
      if (error.code === "23505") {
        setFeedback({ kind: "dup", customer });
      } else {
        setFeedback({ kind: "error", message: error.message });
      }
    } else {
      setFeedback({ kind: "ok", customer });
      fetchVisits(eventId);
    }
    setCandidates([]);
    setNameResults([]);
    setNameQuery("");
    setNumberInput("");
    numberRef.current?.focus();
  }, [eventId, supabase, fetchVisits]);

  /** 番号で検索して即登録（ゼロ埋め違いも許容） */
  const lookupAndRegister = useCallback(async () => {
    const raw = numberInput.trim();
    if (!raw || !eventId || busy) return;
    setBusy(true);
    setFeedback(null);
    setCandidates([]);
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
      if (found.length === 0) {
        setFeedback({ kind: "notfound", input: raw });
        setNumberInput("");
        numberRef.current?.focus();
      } else if (found.length === 1) {
        await register(found[0]);
      } else {
        // 同一番号とみなせる顧客が複数 → 選んでもらう
        setCandidates(found);
      }
    } finally {
      setBusy(false);
    }
  }, [numberInput, eventId, busy, supabase, register]);

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

  const undoVisit = async (visitId: string) => {
    await supabase.from("event_visits").delete().eq("id", visitId);
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

  return (
    <div className="space-y-4">
      {/* 催事の選択 */}
      <Card>
        <CardContent className="pt-4 space-y-2">
          <Label>対象の催事（日程表から選択）</Label>
          {selectedEvent && (
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <div className="font-semibold flex items-baseline gap-2 flex-wrap">
                <span>{selectedEvent.venue}{selectedEvent.store_name ? ` ${selectedEvent.store_name}` : ""}</span>
                {selectedEvent.dm_count != null && (
                  <span className="text-xs font-medium text-primary bg-primary/10 rounded px-1.5 py-0.5">
                    DM {selectedEvent.dm_count.toLocaleString()}枚
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedEvent.start_date}〜{selectedEvent.end_date}
                ／ 登録済みの来場: {visits.length}人
                {selectedEvent.dm_count ? `（反応率 ${((visits.length / selectedEvent.dm_count) * 100).toFixed(1)}%）` : ""}
              </div>
            </div>
          )}
          <div className="max-w-2xl">
            <EventCalendar events={events} selectedId={eventId} onSelect={setEventId} />
          </div>
          <div className="flex flex-col md:flex-row gap-1 md:items-center pt-1">
            <span className="text-xs text-muted-foreground shrink-0">検索して選ぶ場合：</span>
            <Combobox
              items={eventItems}
              value={eventId}
              onChange={setEventId}
              placeholder="会場名などで検索"
              searchPlaceholder="会場名などで検索"
              allowCustom={false}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {canRegister ? (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="text-base font-semibold">お客様番号を入力して Enter</Label>
            <Input
              ref={numberRef}
              value={numberInput}
              onChange={(e) => setNumberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lookupAndRegister();
                }
              }}
              inputMode="numeric"
              autoFocus
              placeholder="ハガキ宛名面の番号"
              disabled={!eventId || busy}
              className="max-w-sm h-14 text-2xl font-mono tracking-wider"
            />

            {/* 直前の結果フィードバック */}
            {feedback?.kind === "ok" && (
              <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-green-800">
                <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-lg">{feedback.customer.name} 様を登録しました</div>
                  <div className="text-xs">#{feedback.customer.customer_no} {feedback.customer.address || ""}</div>
                </div>
              </div>
            )}
            {feedback?.kind === "dup" && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">{feedback.customer.name} 様はこの催事に登録済みです</div>
                  <div className="text-xs">#{feedback.customer.customer_no}</div>
                </div>
              </div>
            )}
            {feedback?.kind === "notfound" && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800">
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold">番号「{feedback.input}」の顧客が見つかりません</div>
                  <div className="text-xs">番号を確かめるか、下の名前検索で探してください</div>
                </div>
              </div>
            )}
            {feedback?.kind === "error" && (
              <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-red-800">
                <XCircle className="h-5 w-5 mt-0.5 shrink-0" />
                <div className="text-sm">登録に失敗しました: {feedback.message}</div>
              </div>
            )}

            {/* 同一番号に複数候補がある場合 */}
            {candidates.length > 0 && (
              <div className="space-y-1.5">
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
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
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

      {/* この催事の来場一覧 */}
      {eventId && visits.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="font-medium">この催事の来場記録（新しい順）</div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {visits.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-3 py-1.5 border rounded-md">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">
                    #{v.customers?.customer_no ?? "?"}
                  </span>
                  <span className="flex-1 truncate font-medium">{v.customers?.name ?? "（削除された顧客）"}</span>
                  {canRegister && (
                    <Button variant="ghost" size="sm" onClick={() => undoVisit(v.id)} title="取消">
                      <Undo2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
