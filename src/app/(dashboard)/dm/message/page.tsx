"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { ArrowLeft, Printer, Info, Save } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { renderRuby } from "@/lib/ruby";
import { PrintPortal } from "@/components/PrintPortal";

type Evt = { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string };
type Form = { lead: string; venue_label: string; title: string; hall: string; period_text: string; hours: string; body: string };

const EMPTY: Form = { lead: "出店のご案内", venue_label: "", title: "", hall: "", period_text: "", hours: "午前10時〜午後8時", body: "" };

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function periodFromDates(start: string, end: string): string {
  if (!start || !end) return "";
  const f = (ymd: string) => {
    const d = new Date(ymd + "T00:00:00");
    return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
  };
  return `${f(start)}〜${f(end)}`;
}

export default function PostcardMessagePage() {
  const { role } = usePermission();
  const canEdit = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<Evt[]>([]);
  const [eventId, setEventId] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, end_date")
      .order("start_date", { ascending: false })
      .limit(400)
      .then(({ data }) => setEvents((data as Evt[]) || []));
  }, [supabase]);

  const eventItems: ComboboxItem[] = useMemo(
    () => events.map((e) => ({
      value: e.id,
      label: `${e.start_date.slice(0, 7)} ${e.venue}${e.store_name ? ` ${e.store_name}` : ""}`,
      group: e.start_date.slice(0, 4) + "年",
    })),
    [events]
  );

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      const evt = events.find((e) => e.id === eventId);
      const { data } = await supabase.from("event_postcards").select("*").eq("event_id", eventId).maybeSingle();
      if (cancelled) return;
      setSaved(false);
      if (data) {
        setForm({
          lead: data.lead || "出店のご案内",
          venue_label: data.venue_label || "",
          title: data.title || "",
          hall: data.hall || "",
          period_text: data.period_text || "",
          hours: data.hours || "午前10時〜午後8時",
          body: data.body || "",
        });
      } else {
        // 初回はイベント情報から下書きを用意
        setForm({
          ...EMPTY,
          venue_label: evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "",
          title: evt?.name || "",
          period_text: evt ? periodFromDates(evt.start_date, evt.end_date) : "",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, events, supabase]);

  const save = async () => {
    if (!eventId) return;
    const { error } = await supabase.from("event_postcards").upsert({ event_id: eventId, ...form }, { onConflict: "event_id" });
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  const set = (k: keyof Form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // 1枚分の文面プレビュー（コンポーネントではなく関数で返す）
  const renderPostcard = () => (
    <div className="pc-msg">
      {form.lead && <div className="pc-lead">{renderRuby(form.lead)}</div>}
      {form.title && <div className="pc-title">{renderRuby(form.title)}</div>}
      <div className="pc-meta">
        {form.venue_label && <div className="pc-venue">{renderRuby(form.venue_label)}</div>}
        {form.hall && <div>会場：{renderRuby(form.hall)}</div>}
        {form.period_text && <div>会期：{renderRuby(form.period_text)}</div>}
        {form.hours && <div>営業時間：{renderRuby(form.hours)}</div>}
      </div>
      {form.body && <div className="pc-body">{renderRuby(form.body)}</div>}
    </div>
  );

  if (!canEdit) return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;

  return (
    <div className="space-y-4 pb-8">
      <style>{`
        .pc-msg { box-sizing: border-box; height: 100%; padding: 10mm 9mm; display: flex; flex-direction: column; gap: 3mm; color: #1a1a1a; }
        .pc-lead { font-size: 12pt; letter-spacing: 4px; color: #b45309; border-bottom: 1.5pt solid #b45309; padding-bottom: 1.5mm; align-self: flex-start; }
        .pc-title { font-size: 19pt; font-weight: 800; line-height: 1.25; }
        .pc-meta { font-size: 10.5pt; line-height: 1.7; }
        .pc-venue { font-weight: 700; font-size: 12pt; }
        .pc-body { font-size: 9.5pt; line-height: 1.6; margin-top: auto; white-space: pre-wrap; }
        .pc-msg ruby rt { font-size: 0.5em; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pc-print { display: block !important; margin: 0; }
          .pc-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; }
          .pc-sheet > .pc-cell { border: 0.3pt dashed #ccc; overflow: hidden; box-sizing: border-box; }
        }
        .pc-print { display: none; }
      `}</style>

      {/* 画面UI */}
      <div className="print:hidden space-y-4">
        <Link href="/dm" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />DMハガキ一覧へ
        </Link>
        <h1 className="text-2xl font-bold">DMはがき 文面の作成・印刷</h1>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div>
            催事ごとに案内文面を作り、A4・4面で印刷します（4枚とも同じ文面）。宛名＋QRの「おもて面」とセットで使います。
            <span className="block mt-0.5">ルビ（ふりがな）は <span className="font-mono bg-white px-1 rounded">｜漢字《かんじ》</span> の形で入力すると、漢字の上に小さく表示されます。</span>
          </div>
        </div>

        <div className="max-w-md">
          <Label className="text-xs mb-1 block">対象の催事</Label>
          <Combobox items={eventItems} value={eventId} onChange={setEventId} allowCustom={false} placeholder="催事を選択" searchPlaceholder="会場名などで検索" />
        </div>

        {eventId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 入力 */}
            <Card>
              <CardContent className="pt-4 space-y-2.5">
                {([
                  ["lead", "見出し"],
                  ["venue_label", "百貨店名・店"],
                  ["title", "催事名"],
                  ["hall", "会場・階"],
                  ["period_text", "会期"],
                  ["hours", "営業時間"],
                ] as const).map(([k, label]) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <Input value={form[k]} onChange={(e) => set(k, e.target.value)} />
                  </div>
                ))}
                <div className="space-y-1">
                  <Label className="text-xs">本文・ごあいさつ</Label>
                  <Textarea value={form.body} onChange={(e) => set("body", e.target.value)} rows={4} />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={save}><Save className="h-4 w-4 mr-1" />保存</Button>
                  {saved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
                  <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />4面印刷</Button>
                </div>
              </CardContent>
            </Card>

            {/* プレビュー（1枚） */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">プレビュー（はがき1枚）</Label>
              <div className="border rounded-md bg-white shadow-sm mx-auto" style={{ width: "105mm", height: "148.5mm" }}>
                {renderPostcard()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 印刷（4面・全て同じ文面）— body直下にポータルで出す */}
      {eventId && (
        <PrintPortal>
          <div className="pc-print">
            <div className="pc-sheet">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pc-cell">{renderPostcard()}</div>
              ))}
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}
