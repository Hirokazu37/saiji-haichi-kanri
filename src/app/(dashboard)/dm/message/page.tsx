"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Printer, Info, Save, ArrowUp, ArrowDown, Trash2, Plus, AlignLeft, AlignCenter, AlignRight, Mail, FileText } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";
import { renderRuby } from "@/lib/ruby";
import { PrintPortal } from "@/components/PrintPortal";
import { EventCalendar } from "@/components/customers/EventCalendar";
import type { EventLite } from "@/components/customers/types";

type Evt = { id: string; name: string | null; venue: string; store_name: string | null; start_date: string; end_date: string; dm_count: number | null; venue_floor: string | null };
type ProofRow = { id: string; path: string; file_name: string | null; kind: string | null; note: string | null; created_by: string | null; created_at: string };
type Align = "left" | "center" | "right";
type Space = "wide" | "normal" | "tight";
type Block = { id: string; style: string; align: Align; space: Space; label: string; text: string };

const SPACE_OPTIONS: { value: Space; name: string }[] = [
  { value: "wide", name: "ひろめ" },
  { value: "normal", name: "標準" },
  { value: "tight", name: "つめる" },
];
const SPACE_MARGIN: Record<Space, string> = { wide: "2mm 0", normal: "0.7mm 0", tight: "0.1mm 0" };
const normSpace = (v: unknown): Space => (v === "wide" || v === "tight" ? v : "normal");

// 裏面（ビジュアル面）の種別。画像は public/dm に同梱
type Kind = "jisshin" | "sokubai";
const KIND_OPTIONS: { value: Kind; name: string }[] = [
  { value: "jisshin", name: "実演" },
  { value: "sokubai", name: "即売" },
];
const URA_SRC: Record<Kind, string> = { jisshin: "/dm/ura-jisshin.jpg", sokubai: "/dm/ura-sokubai.jpg" };
const OMOTE_SRC = "/dm/omote.jpg";

// 見た目（サイズ・太さ）基準のスタイル。fs=ポイント
type StyleDef = { value: string; name: string; fs: number; fw: number; color?: string; boxed?: boolean };
const STYLES: StyleDef[] = [
  { value: "box", name: "囲み（タイトル枠）", fs: 9.5, fw: 600, boxed: true },
  { value: "xl", name: "特大・太字", fs: 12, fw: 800 },
  { value: "lg", name: "大・太字", fs: 10.5, fw: 700 },
  { value: "md", name: "中", fs: 10, fw: 600 },
  { value: "normal", name: "標準", fs: 9, fw: 400 },
  { value: "sm", name: "小・注記", fs: 7.5, fw: 400, color: "#555" },
];
const STYLE_MAP: Record<string, StyleDef> = Object.fromEntries(STYLES.map((s) => [s.value, s]));
// 旧スタイル名 → 新スタイル
const MIGRATE: Record<string, string> = { lead: "box", title: "xl", venue: "lg", normal: "normal", small: "sm" };
const normStyle = (v: string) => (STYLE_MAP[v] ? v : MIGRATE[v] || "normal");

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b${Math.random().toString(36).slice(2)}`;

const WD = ["日", "月", "火", "水", "木", "金", "土"];
function periodFromDates(start: string, end: string): string {
  if (!start || !end) return "";
  const f = (ymd: string) => {
    const d = new Date(ymd + "T00:00:00");
    return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`;
  };
  return `${f(start)}〜${f(end)}`;
}

function spanStyle(s: StyleDef): React.CSSProperties {
  return {
    fontSize: `${s.fs}pt`,
    fontWeight: s.fw,
    color: s.color,
    lineHeight: 1.5,
    letterSpacing: s.boxed ? "3px" : undefined,
    ...(s.boxed ? { display: "inline-block", border: "0.8pt solid #222", padding: "0.8mm 5mm" } : {}),
  };
}

// 会場行のテキスト（店名＋階。階が未入力なら ○階 のプレースホルダ）
function venueLine(evt: Evt | undefined): string {
  const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
  return `${venue}${evt?.venue_floor ? `　${evt.venue_floor}` : "　○階"}`;
}

function defaultBlocks(evt: Evt | undefined): Block[] {
  return [
    { id: newId(), style: "box", align: "center", space: "normal", label: "", text: "出店のご案内" },
    { id: newId(), style: "xl", align: "center", space: "normal", label: "", text: evt?.name ? `「${evt.name}」` : "" },
    { id: newId(), style: "normal", align: "center", space: "normal", label: "期間", text: evt ? periodFromDates(evt.start_date, evt.end_date) : "" },
    { id: newId(), style: "normal", align: "center", space: "normal", label: "会場", text: venueLine(evt) },
    { id: newId(), style: "normal", align: "center", space: "normal", label: "営業時間", text: "午前10時〜午後8時" },
    { id: newId(), style: "sm", align: "center", space: "normal", label: "", text: "" },
  ];
}

export default function PostcardMessagePage() {
  const { role, displayName } = usePermission();
  const canEdit = role === "admin" || role === "viewer";
  const supabase = createClient();
  const [events, setEvents] = useState<Evt[]>([]);
  const [eventId, setEventId] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [kind, setKind] = useState<Kind>("sokubai");
  const [saved, setSaved] = useState(false);
  // 百貨店ごとのテンプレート（体裁＋癖メモ）
  const [storeNote, setStoreNote] = useState("");
  const [hasTemplate, setHasTemplate] = useState(false);
  const [tplSaved, setTplSaved] = useState(false);
  const proofRef = useRef<HTMLDivElement>(null);
  const [attachInfo, setAttachInfo] = useState<string | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [proofRefreshKey, setProofRefreshKey] = useState(0);

  const printWith = (cls: string) => {
    document.body.classList.add(cls);
    window.print();
    document.body.classList.remove(cls);
  };

  useEffect(() => {
    supabase
      .from("events")
      .select("id, name, venue, store_name, start_date, end_date, dm_count, venue_floor")
      .order("start_date", { ascending: false })
      .limit(400)
      .then(({ data }) => setEvents((data as Evt[]) || []));
  }, [supabase]);

  // 校正履歴（この催事に保存済みのPDF一覧）
  useEffect(() => {
    if (!eventId) { setProofs([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("event_proofs")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (!cancelled) setProofs((data as ProofRow[]) || []);
    })();
    return () => { cancelled = true; };
  }, [eventId, supabase, proofRefreshKey]);

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
      const vKey = evt ? `${evt.venue}|${evt.store_name || ""}` : "";
      const [{ data }, { data: tpl }] = await Promise.all([
        supabase.from("event_postcards").select("*").eq("event_id", eventId).maybeSingle(),
        vKey ? supabase.from("dm_templates").select("*").eq("venue_key", vKey).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setSaved(false);
      setTplSaved(false);
      setStoreNote((tpl as { note?: string } | null)?.note || "");
      setHasTemplate(!!tpl);
      const mapBlocks = (arr: Block[]) => arr.map((b) => ({
        id: b.id || newId(),
        style: normStyle(b.style),
        align: (b.align as Align) || "center",
        space: normSpace(b.space),
        label: b.label || "",
        text: b.text || "",
      }));
      const tplBlocks = (tpl as { blocks?: Block[] } | null)?.blocks;
      if (data?.blocks && Array.isArray(data.blocks) && data.blocks.length > 0) {
        // この催事で保存済みの文面を優先
        setBlocks(mapBlocks(data.blocks as Block[]));
      } else if (tplBlocks && Array.isArray(tplBlocks) && tplBlocks.length > 0) {
        // 保存が無ければ、この百貨店の標準テンプレートを適用（会場の階はこの催事の値を反映）
        const tb = mapBlocks(tplBlocks);
        if (evt?.venue_floor) {
          const idx = tb.findIndex((b) => b.label === "会場");
          if (idx >= 0) tb[idx] = { ...tb[idx], text: venueLine(evt) };
        }
        setBlocks(tb);
      } else if (data) {
        const venue = evt ? `${evt.venue}${evt.store_name ? ` ${evt.store_name}` : ""}` : "";
        setBlocks([
          { id: newId(), style: "box", align: "center", space: "normal", label: "", text: data.lead || "出店のご案内" },
          { id: newId(), style: "xl", align: "center", space: "normal", label: "", text: data.title || evt?.name || "" },
          { id: newId(), style: "normal", align: "center", space: "normal", label: "期間", text: data.period_text || "" },
          { id: newId(), style: "normal", align: "center", space: "normal", label: "会場", text: data.venue_label || `${venue}　○階` },
          { id: newId(), style: "normal", align: "center", space: "normal", label: "営業時間", text: data.hours || "午前10時〜午後8時" },
          { id: newId(), style: "sm", align: "center", space: "normal", label: "", text: data.body || "" },
        ]);
      } else {
        setBlocks(defaultBlocks(evt));
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, events, supabase]);

  const save = async () => {
    if (!eventId) return;
    const { error } = await supabase.from("event_postcards").upsert({ event_id: eventId, blocks }, { onConflict: "event_id" });
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  };

  // 現在の文面＋メモを「この百貨店の標準テンプレート」として保存
  const saveTemplate = async () => {
    const evt = events.find((e) => e.id === eventId);
    if (!evt) return;
    const vKey = `${evt.venue}|${evt.store_name || ""}`;
    const { error } = await supabase.from("dm_templates").upsert({
      venue_key: vKey,
      venue: evt.venue,
      store_name: evt.store_name || null,
      blocks,
      note: storeNote.trim() || null,
    }, { onConflict: "venue_key" });
    if (!error) { setHasTemplate(true); setTplSaved(true); setTimeout(() => setTplSaved(false), 2000); }
  };

  const update = (id: string, patch: Partial<Block>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (idx: number, dir: -1 | 1) =>
    setBlocks((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const remove = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));
  const add = () => setBlocks((prev) => [...prev, { id: newId(), style: "normal", align: "center", space: "normal", label: "", text: "" }]);

  // 校正依頼に使う催事情報
  const proofInfo = () => {
    const ev = events.find((e) => e.id === eventId);
    const venue = ev ? `${ev.venue}${ev.store_name ? ` ${ev.store_name}` : ""}` : "";
    const title = (blocks.find((b) => normStyle(b.style) === "xl")?.text || ev?.name || "").replace(/[「」]/g, "");
    const period = ev ? periodFromDates(ev.start_date, ev.end_date) : "";
    return { venue, title, period };
  };

  // 校正プレビューをPDFに変換（原稿の添付・共有用）
  const renderProofPdf = async (): Promise<File | null> => {
    if (!proofRef.current) return null;
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");
      const canvas = await html2canvas(proofRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pxW = canvas.width, pxH = canvas.height;
      const orientation = pxW >= pxH ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const ratio = pxW / pxH;
      let w = pageW - margin * 2;
      let h = w / ratio;
      if (h > pageH - margin * 2) { h = pageH - margin * 2; w = h * ratio; }
      pdf.addImage(imgData, "JPEG", (pageW - w) / 2, (pageH - h) / 2, w, h);
      const blob = pdf.output("blob");
      const { venue } = proofInfo();
      return new File([blob], `DMハガキ校正_${venue || "原稿"}.pdf`, { type: "application/pdf" });
    } catch {
      return null;
    }
  };

  const sendMail = async () => {
    const { venue, title, period } = proofInfo();
    const subject = `DMハガキ校正のお願い（${venue}${title ? ` / ${title}` : ""}）`;
    const body =
      `${venue ? `${venue}　DMハガキ校正ご担当者様\n\n` : ""}` +
      `いつもお世話になっております。安岡蒲鉾でございます。\n\n` +
      `下記催事のDMハガキにつきまして、校正をお願いいたします。\n` +
      `　会場：${venue}\n` +
      (title ? `　催事名：${title}\n` : "") +
      (period ? `　会期：${period}\n` : "") +
      `\nDMハガキの原稿（校正用）を添付いたしますので、ご確認のほどよろしくお願いいたします。\n\n` +
      `------------------------------\n` +
      `有限会社 安岡蒲鉾店\n〒798-1133 愛媛県宇和島市三間町中野中293番地\n` +
      `TEL 0895-58-2155 / FAX 0895-58-2706 / フリーダイヤル 0120-58-7771`;

    // メールの新規下書きを開くだけ（PDFは「PDFを保存」で別途保存して添付）
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // 通常ダウンロード（保存先はブラウザ設定のフォルダ）
  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // 保存先を選べるブラウザ(Chrome/Edge)は保存ダイアログ、非対応は通常ダウンロード
  const saveProofFile = async (file: File, note?: string): Promise<boolean> => {
    type PickerWin = Window & {
      showSaveFilePicker?: (o: { suggestedName?: string; types?: { description?: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;
    };
    const w = window as PickerWin;
    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: file.name,
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(file);
        await writable.close();
        setAttachInfo(`原稿PDFを保存しました（選んだ場所に「${file.name}」）。${note ?? ""}`);
        return true;
      } catch (e) {
        if ((e as DOMException)?.name === "AbortError") { setAttachInfo("保存をキャンセルしました。"); return false; }
        // それ以外の失敗は通常ダウンロードへ
      }
    }
    downloadFile(file);
    setAttachInfo(`原稿PDFを保存しました：「${file.name}」（ブラウザのダウンロード先フォルダ）。${note ?? ""}`);
    return true;
  };

  // 原稿PDFだけを保存（メールやFAXに添付する用）
  const savePdf = async () => {
    const file = await renderProofPdf();
    if (!file) { setAttachInfo("原稿PDFの生成に失敗しました。少し待って再度お試しください。"); return; }
    await saveProofFile(file);
  };

  // 校正PDFをアプリ（Storage）に履歴として保存
  const saveToApp = async () => {
    if (!eventId) return;
    const file = await renderProofPdf();
    if (!file) { setAttachInfo("原稿PDFの生成に失敗しました。少し待って再度お試しください。"); return; }
    const path = `${eventId}/${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from("proofs").upload(path, file, { contentType: "application/pdf", upsert: false });
    if (upErr) { setAttachInfo(`校正履歴の保存に失敗しました: ${upErr.message}`); return; }
    const { error: insErr } = await supabase.from("event_proofs").insert({
      event_id: eventId, path, file_name: file.name, kind, created_by: displayName || null,
    });
    if (insErr) { setAttachInfo(`校正履歴の記録に失敗しました: ${insErr.message}`); return; }
    setAttachInfo("校正履歴に保存しました。下の「校正履歴」から開けます。");
    setProofRefreshKey((k) => k + 1);
  };

  const openProof = async (p: ProofRow) => {
    const { data } = await supabase.storage.from("proofs").createSignedUrl(p.path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const deleteProof = async (p: ProofRow) => {
    if (!window.confirm("この校正履歴を削除しますか？")) return;
    await supabase.storage.from("proofs").remove([p.path]);
    await supabase.from("event_proofs").delete().eq("id", p.id);
    setProofRefreshKey((k) => k + 1);
  };

  const downloadFax = () => {
    const { venue, title, period } = proofInfo();
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    const recipient = `${venue || "○○百貨店"}　DMハガキ校正ご担当者様`;
    const eventBullet = venue || title || period
      ? `<p>・催事：${venue}${title ? ` ${title}` : ""}${period ? `（${period}）` : ""}</p>`
      : "";
    const html =
      `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">` +
      `<head><meta charset="utf-8"><title>ＦＡＸ送信のご案内</title></head>` +
      `<body style="font-family:'Yu Gothic','游ゴシック','ＭＳ Ｐゴシック',sans-serif; font-size:11pt; line-height:1.9;">` +
      `<h2 style="text-align:center; letter-spacing:6px; margin-bottom:18pt;">ＦＡＸ送信のご案内</h2>` +
      `<p>発信日　${dateStr}</p>` +
      `<p>発信元　　　有限会社　安岡蒲鉾店<br>` +
      `　　　　　　本社工場　愛媛県宇和島市三間町中野中293番地<br>` +
      `　　　　　　ＴＥＬ　0895-58-2155<br>` +
      `　　　　　　ＦＡＸ　0895-58-2706</p>` +
      `<p style="font-size:13pt; margin-top:14pt;">${recipient}</p>` +
      `<p>発信枚数　　２　枚　（　本紙含む　）</p>` +
      `<p>ＤＭハガキの原稿を送信いたしますので、ご校正のほどよろしくお願いいたします。</p>` +
      `<p style="text-align:center; margin:12pt 0;">記</p>` +
      `<p>この度は大変お世話になっております。<br>` +
      `下記のとおり、ＤＭハガキの原稿（校正用）を送信いたしますので、ご確認のうえ、ご校正くださいますようお願い申し上げます。<br>` +
      `お気づきの点やご修正のご指示がございましたら、ご連絡いただきますようお願いいたします。</p>` +
      `<p>■ＤＭハガキ　原稿校正のお願い</p>` +
      `<p>・ＤＭハガキ原稿（校正用）　　１部</p>` +
      eventBullet +
      `<p style="text-align:right; margin-top:8pt;">以上</p>` +
      `</body></html>`;
    const blob = new Blob(["﻿", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `DM校正依頼_${venue || "FAX送信状"}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderPostcard = () => (
    <div className="pc-msg">
      <div className="pc-anno" style={{ justifyContent: "flex-end" }}>
        {blocks.filter((b) => b.text.trim() || b.label.trim()).map((b) => {
          const s = STYLE_MAP[normStyle(b.style)];
          return (
            <div key={b.id} style={{ textAlign: b.align, margin: SPACE_MARGIN[normSpace(b.space)] }}>
              <span style={spanStyle(s)}>
                {b.label.trim() && <span>{b.label} </span>}
                {renderRuby(b.text)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const ALIGN_ICON = { left: AlignLeft, center: AlignCenter, right: AlignRight };

  if (!canEdit) return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;

  return (
    <div className="space-y-4 pb-8">
      <style>{`
        /* 案内文面ボックス: 横98mm×縦42mm、下から25mm。縦位置(vpos)は枠内の寄せ */
        .pc-msg { box-sizing: border-box; position: absolute; inset: 0; color: #1a1a1a; }
        .pc-anno { position: absolute; left: 0; right: 0; bottom: 25mm; margin: 0 auto; width: 98mm; height: 34mm; padding: 1.5mm 3mm; box-sizing: border-box; display: flex; flex-direction: column; }
        .pc-msg ruby rt { font-size: 0.5em; }
        /* はがき台紙（校正で背景画像を敷く） */
        .hagaki { position: relative; overflow: hidden; background: #fff; }
        .hagaki > img.bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .pc-print { display: none !important; }
          body.pp-4 .pc-print-4 { display: block !important; }
          body.pp-proof .pc-print-proof { display: block !important; }
          .pc-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; }
          .pc-sheet > .pc-cell { position: relative; background: #fff; overflow: hidden; box-sizing: border-box; }
          /* 校正: 単票・両面をA4縦に横並び（おもて左／裏面右） */
          .proof-stack { width: 210mm; display: flex; justify-content: center; gap: 5mm; padding-top: 8mm; }
          .proof-card { width: 100mm; height: 148mm; }
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
            各行で見た目（サイズ・太さ）と<span className="font-semibold">左/中央/右の揃え</span>を選べます。↑↓で並べ替え、改行も自由です。
            <span className="block mt-0.5">ルビは <span className="font-mono bg-white px-1 rounded">｜漢字《かんじ》</span> の形で入力。空欄の行は印刷されません。</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs block">対象の催事（カレンダーから選択）</Label>
          <div className="max-w-2xl mx-auto">
            <EventCalendar events={events as EventLite[]} selectedId={eventId} onSelect={setEventId} />
          </div>
          <div className="flex flex-col md:flex-row gap-1 md:items-center justify-center">
            <span className="text-xs text-muted-foreground shrink-0">検索して選ぶ場合：</span>
            <Combobox items={eventItems} value={eventId} onChange={(v) => { if (v) setEventId(v); }} allowCustom={false} placeholder="会場名などで検索" searchPlaceholder="会場名などで検索" className="max-w-md" />
          </div>
        </div>

        {eventId && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground shrink-0">裏面の種別</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as Kind)}>
                <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue>{KIND_OPTIONS.find((o) => o.value === kind)?.name}</SelectValue></SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* 百貨店ごとの設定（癖メモ＋標準テンプレート） */}
        {eventId && (
          <div className="rounded-md border bg-amber-50/40 px-3 py-2.5 space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm font-medium">この百貨店の設定（癖・標準レイアウト）</Label>
              {hasTemplate && <span className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">標準を記憶済み</span>}
            </div>
            {storeNote.trim() && (
              <div className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-sm text-amber-900 font-medium">
                💡 この店舗の注意点：{storeNote}
              </div>
            )}
            <Textarea
              value={storeNote}
              onChange={(e) => setStoreNote(e.target.value)}
              rows={2}
              placeholder="この百貨店の癖・注意（例: 会場は「○階 催事場」と書く／期間は『会期』表記／○○の文言を必ず入れる など）"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={saveTemplate}>
                <Save className="h-4 w-4 mr-1" />この店舗の標準として保存（文面＋メモ）
              </Button>
              {tplSaved && <span className="text-xs text-emerald-700 font-medium">✓ 保存しました</span>}
              <span className="text-xs text-muted-foreground">同じ百貨店の次の催事は、この体裁とメモが自動で出ます。</span>
            </div>
          </div>
        )}

        {eventId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            {/* ブロック編集 */}
            <Card>
              <CardContent className="pt-4 space-y-3">
                {blocks.map((b, i) => (
                  <div key={b.id} className="rounded-md border p-2.5 space-y-2 bg-muted/20">
                    {/* 1行目: スタイル選択 + 上下/削除 */}
                    <div className="flex items-center gap-1.5">
                      <Select value={normStyle(b.style)} onValueChange={(v) => v && update(b.id, { style: v })}>
                        <SelectTrigger className="h-8 text-xs flex-1"><SelectValue>{STYLE_MAP[normStyle(b.style)]?.name}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {STYLES.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              <span style={{ fontSize: `${s.fs}pt`, fontWeight: s.fw, color: s.color }}>{s.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, -1)} disabled={i === 0} title="上へ"><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title="下へ"><ArrowDown className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 ml-2 text-destructive hover:bg-destructive/10" onClick={() => { if (window.confirm("この行を削除しますか？")) remove(b.id); }} title="この行を削除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    {/* 2行目: 揃え + ラベル */}
                    <div className="flex items-center gap-1.5">
                      <div className="inline-flex rounded-md border overflow-hidden shrink-0">
                        {(["left", "center", "right"] as Align[]).map((a) => {
                          const Icon = ALIGN_ICON[a];
                          return (
                            <button key={a} type="button" onClick={() => update(b.id, { align: a })} title={a === "left" ? "左寄せ" : a === "center" ? "中央寄せ" : "右寄せ"}
                              className={cn("h-8 w-9 flex items-center justify-center", b.align === a ? "bg-primary text-primary-foreground" : "bg-white hover:bg-muted")}>
                              <Icon className="h-4 w-4" />
                            </button>
                          );
                        })}
                      </div>
                      <Select value={normSpace(b.space)} onValueChange={(v) => v && update(b.id, { space: v as Space })}>
                        <SelectTrigger className="h-8 text-xs w-[88px] shrink-0"><SelectValue>{SPACE_OPTIONS.find((o) => o.value === normSpace(b.space))?.name}</SelectValue></SelectTrigger>
                        <SelectContent>
                          {SPACE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Input value={b.label} onChange={(e) => update(b.id, { label: e.target.value })} placeholder="ラベル（任意）" className="h-8 text-sm flex-1" />
                    </div>
                    <Textarea value={b.text} onChange={(e) => update(b.id, { text: e.target.value })} rows={2} placeholder="本文（改行可・ルビ可）" />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" />行を追加</Button>
                <div className="flex items-center gap-2 pt-1 border-t mt-1">
                  <Button onClick={save}><Save className="h-4 w-4 mr-1" />保存</Button>
                  {saved && <span className="text-xs text-green-600 font-medium">✓ 保存しました</span>}
                  <Button variant="outline" onClick={() => printWith("pp-4")}><Printer className="h-4 w-4 mr-1" />4面印刷（文面）</Button>
                </div>
              </CardContent>
            </Card>

            {/* プレビュー（1枚・文面のみ）— スクロールしても追従 */}
            <div className="space-y-1 lg:sticky lg:top-4 self-start">
              <Label className="text-xs text-muted-foreground">プレビュー（文面のみ）</Label>
              <div className="relative overflow-hidden border rounded-md bg-white shadow-sm mx-auto" style={{ width: "105mm", height: "148.5mm" }}>
                {renderPostcard()}
              </div>
            </div>
          </div>
        )}

        {/* 校正プレビュー（実物イメージ・両面） */}
        {eventId && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-sm font-medium mr-1">校正プレビュー（実物イメージ）</Label>
              <Button size="sm" onClick={sendMail}>
                <Mail className="h-4 w-4 mr-1" />メールで校正依頼
              </Button>
              <Button variant="outline" size="sm" onClick={savePdf}>
                <FileText className="h-4 w-4 mr-1" />PDFを保存（パソコンに）
              </Button>
              <Button variant="outline" size="sm" onClick={downloadFax}>
                <FileText className="h-4 w-4 mr-1" />FAX送信状（Word）
              </Button>
              <Button variant="outline" size="sm" onClick={() => printWith("pp-proof")}>
                <Printer className="h-4 w-4 mr-1" />印刷（紙）
              </Button>
              <Button variant="ghost" size="sm" onClick={saveToApp}>
                <Save className="h-4 w-4 mr-1" />アプリに記録（履歴）
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              送付用：<span className="font-medium">「PDFを保存」</span>でパソコンに保存 →「メールで校正依頼」で開いた下書きに添付（スマホは共有でそのまま添付）。FAXは「FAX送信状」、紙に刷るなら「印刷」。「アプリに記録」は社内で後から見返す控えです。
            </p>
            {attachInfo && (
              <div className="flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900 max-w-2xl">
                <FileText className="h-4 w-4 mt-0.5 shrink-0 text-emerald-700" />
                <span>{attachInfo}</span>
              </div>
            )}

            {/* 校正履歴（アプリに保存したPDF） */}
            {proofs.length > 0 && (
              <div className="space-y-1 max-w-2xl">
                <div className="text-xs font-medium text-muted-foreground">校正履歴（アプリ保存分）</div>
                <div className="space-y-1">
                  {proofs.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm">
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">{p.created_at.slice(0, 16).replace("T", " ")}</span>
                      {p.kind && <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">{KIND_OPTIONS.find((o) => o.value === p.kind)?.name ?? p.kind}</span>}
                      <span className="flex-1 truncate">{p.file_name || "校正PDF"}{p.created_by ? `（${p.created_by}）` : ""}</span>
                      <Button size="sm" variant="outline" className="h-7" onClick={() => openProof(p)}>開く</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => deleteProof(p)}>削除</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div ref={proofRef} className="flex flex-wrap gap-4 bg-white p-2 w-fit">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">おもて（宛名面＋案内文面）</div>
                <div className="hagaki border shadow-sm" style={{ width: "100mm", height: "148mm" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bg" src={OMOTE_SRC} alt="おもて" />
                  {renderPostcard()}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">裏面（{KIND_OPTIONS.find((o) => o.value === kind)?.name}）</div>
                <div className="hagaki border shadow-sm" style={{ width: "100mm", height: "148mm" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="bg" src={URA_SRC[kind]} alt="裏面" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 印刷 — body直下にポータルで出す（印刷時にbodyのクラスでどちらを出すか切替） */}
      {eventId && (
        <PrintPortal>
          {/* 本番: 文面4面 */}
          <div className="pc-print pc-print-4">
            <div className="pc-sheet">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="pc-cell">{renderPostcard()}</div>
              ))}
            </div>
          </div>
          {/* 校正: 単票・両面（おもて左／裏面右の横並び） */}
          <div className="pc-print pc-print-proof">
            <div className="proof-stack">
              <div className="hagaki proof-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="bg" src={OMOTE_SRC} alt="おもて" />
                {renderPostcard()}
              </div>
              <div className="hagaki proof-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="bg" src={URA_SRC[kind]} alt="裏面" />
              </div>
            </div>
          </div>
        </PrintPortal>
      )}
    </div>
  );
}
