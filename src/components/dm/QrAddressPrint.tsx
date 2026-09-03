"use client";

import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Info, Save, Database } from "lucide-react";
import { parseCsvFile } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { PrintPortal } from "@/components/PrintPortal";
import { createClient } from "@/lib/supabase/client";

const NONE = "__none__";

type FieldKey = "customer_no" | "name" | "postal" | "pref" | "city" | "addr1" | "addr2" | "addr3";
const FIELDS: { key: FieldKey; label: string; required?: boolean; re: RegExp }[] = [
  { key: "customer_no", label: "顧客番号（QRに入れる）", required: true, re: /得意先コード|得意先CD|顧客番号|顧客コード|顧客No|会員番号|^コード$/i },
  { key: "name", label: "氏名", required: true, re: /氏名|名前|得意先名|顧客名/ },
  { key: "postal", label: "郵便番号", re: /郵便|〒/ },
  { key: "pref", label: "都道府県", re: /都道府県/ },
  { key: "city", label: "市区町村", re: /市区町村|市町村/ },
  { key: "addr1", label: "住所１", re: /住所[1１]|^住所$|得意先住所$/ },
  { key: "addr2", label: "住所２（建物名など）", re: /住所[2２]/ },
  { key: "addr3", label: "住所３", re: /住所[3３]/ },
];

type Postcard = { no: string; name: string; postal: string; address: string; qr: string };

function guess(headers: string[]): Record<FieldKey, string> {
  const m = {} as Record<FieldKey, string>;
  for (const f of FIELDS) m[f.key] = NONE;
  headers.forEach((h, i) => {
    for (const f of FIELDS) {
      if (m[f.key] !== NONE) continue;
      if (f.key === "name" && /カナ|かな|フリガナ/.test(h)) continue;
      if (f.re.test(h)) { m[f.key] = String(i); break; }
    }
  });
  return m;
}

// 郵便番号は住所のすぐ上に 〒XXX-XXXX 形式で表示
const fmtPostal = (p: string) => {
  const d = p.replace(/[^0-9]/g, "");
  if (d.length === 7) return `〒${d.slice(0, 3)}-${d.slice(3)}`;
  return d ? `〒${d}` : "";
};

// 画面プレビューの宛名要素スタイル（印刷CSSの .qr-* と同じ値）
const S_POSTAL: React.CSSProperties = { position: "absolute", top: "21mm", left: "30mm", width: "65mm", fontSize: "11pt" };
const S_ADDR: React.CSSProperties = { position: "absolute", top: "27mm", left: "30mm", width: "65mm", fontSize: "11pt", lineHeight: 1.5 };
const S_NAME: React.CSSProperties = { position: "absolute", top: "46mm", left: "30mm", width: "65mm", fontSize: "14pt" };
const S_QR: React.CSSProperties = { position: "absolute", top: "55mm", right: "10mm", width: "18mm", height: "18mm" };
const S_NO: React.CSSProperties = { position: "absolute", top: "73mm", right: "8mm", width: "22mm", textAlign: "center", fontSize: "9pt", color: "#333" };

/** 名簿CSV（宛名つき）から QR付き宛名はがきを作って印刷する部品。
 *  印刷は body.pp-address クラスで制御し、他の印刷（文面など）と共存できる。 */
export function QrAddressPrint({ frontOverlay, eventId, eventLabel }: { frontOverlay?: React.ReactNode; eventId?: string; eventLabel?: string } = {}) {
  const supabase = createClient();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(() => {
    const m = {} as Record<FieldKey, string>;
    for (const f of FIELDS) m[f.key] = NONE;
    return m;
  });
  const [cards, setCards] = useState<Postcard[] | null>(null);
  // DB名簿読込時の区分別内訳 (「区分4-112 阪神百貨店: 1,205件」など)
  const [segBreakdown, setSegBreakdown] = useState<Array<{ key: string; name: string; count: number }>>([]);
  const [noSegCount, setNoSegCount] = useState<number>(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  // 面ごと（左上/右上/左下/右下）の宛名位置の微調整（mm）。テンプレ枠に合わせる。
  // この端末に保存した値があれば読み込む。
  const [quadOffsets, setQuadOffsets] = useState<{ dx: number; dy: number }[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = localStorage.getItem("dm_qr_quad_offsets");
        if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length === 4) return a; }
      } catch { /* ignore */ }
    }
    return [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }];
  });
  const [posSaved, setPosSaved] = useState(false);
  const [dirty, setDirty] = useState(false); // 保存後に位置を変えたか（保存ボタンの色変化用）
  const setQuad = (i: number, axis: "dx" | "dy", v: number) => {
    setQuadOffsets((prev) => prev.map((q, idx) => (idx === i ? { ...q, [axis]: v } : q)));
    setDirty(true);
  };
  // 文面(frontOverlay)用の面別mmオフセット。宛名と同じUIで別途調整する。
  // frontOverlay がある時（=おもて面）だけ表示・適用する。
  const [msgOffsets, setMsgOffsets] = useState<{ dx: number; dy: number }[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const s = localStorage.getItem("dm_msg_quad_offsets");
        if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length === 4) return a; }
      } catch { /* ignore */ }
    }
    return [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }];
  });
  const [msgDirty, setMsgDirty] = useState(false);
  const [msgPosSaved, setMsgPosSaved] = useState(false);
  const setMsgQuad = (i: number, axis: "dx" | "dy", v: number) => {
    setMsgOffsets((prev) => prev.map((q, idx) => (idx === i ? { ...q, [axis]: v } : q)));
    setMsgDirty(true);
  };
  const savePositions = () => {
    try { localStorage.setItem("dm_qr_quad_offsets", JSON.stringify(quadOffsets)); } catch { /* ignore */ }
    setDirty(false);
    setPosSaved(true);
    setTimeout(() => setPosSaved(false), 2000);
  };
  const saveMsgPositions = () => {
    try { localStorage.setItem("dm_msg_quad_offsets", JSON.stringify(msgOffsets)); } catch { /* ignore */ }
    setMsgDirty(false);
    setMsgPosSaved(true);
    setTimeout(() => setMsgPosSaved(false), 2000);
  };
  // 全体を右に3mm寄せた上で、面ごとの微調整を加える
  const shiftFor = (i: number): React.CSSProperties => ({ transform: `translate(${3 + quadOffsets[i].dx}mm, ${quadOffsets[i].dy}mm)` });
  // 文面用のシフト (基準はオフセットなし、微調整のみ)
  const msgShiftFor = (i: number): React.CSSProperties => ({ transform: `translate(${msgOffsets[i].dx}mm, ${msgOffsets[i].dy}mm)` });
  const QUAD_LABELS = ["左上", "右上", "左下", "右下"];

  // 1枚分の宛名（画面プレビュー用）。q=面インデックスで微調整を反映
  const cardInner = (c: Postcard, q: number) => (
    <div style={{ position: "absolute", inset: 0, ...shiftFor(q) }}>
      {c.postal && <div style={S_POSTAL}>{fmtPostal(c.postal)}</div>}
      <div style={S_ADDR}>{c.address}</div>
      <div style={S_NAME}>{c.name}　様</div>
      <div style={S_QR} dangerouslySetInnerHTML={{ __html: c.qr }} />
      <div style={S_NO}>{c.no}</div>
    </div>
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 読み込んだ宛名つきCSVを「ブラウザのこのセッション中」だけ保持する。
  // ページを移動しても（/dm/message ↔ /dm/postcards）使い回せる。
  // 住所を含むためサーバには保存せず、タブ/ブラウザを閉じると消える（個人情報最小化の方針を維持）。
  const ROSTER_KEY = "dm_qr_roster_v1";
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const s = sessionStorage.getItem(ROSTER_KEY);
      if (!s) return;
      const d = JSON.parse(s) as { fileName?: string; headers?: string[]; rows?: string[][]; mapping?: Record<FieldKey, string> };
      if (d.rows?.length && d.headers?.length) {
        setFileName(d.fileName || "");
        setHeaders(d.headers);
        setRows(d.rows);
        if (d.mapping) setMapping(d.mapping);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (rows.length && headers.length) {
        sessionStorage.setItem(ROSTER_KEY, JSON.stringify({ fileName, headers, rows, mapping }));
      }
    } catch { /* 容量超過などは無視（保持できないだけ） */ }
  }, [fileName, headers, rows, mapping]);

  // CSVを選ぶ。File System Access API があれば showOpenFilePicker を使い、
  // id を付けることで「前回開いたフォルダ」をブラウザが記憶する
  // （= 一度 校正原稿フォルダ を開けば、次回以降はそこから開く）。
  const pickFile = async () => {
    const w = window as unknown as {
      showOpenFilePicker?: (opts: object) => Promise<Array<{ getFile: () => Promise<File> }>>;
    };
    if (w.showOpenFilePicker) {
      try {
        const [handle] = await w.showOpenFilePicker({
          id: "dmKouseiRoster", // このIDごとに前回フォルダを記憶する
          startIn: "documents",
          types: [{ description: "CSV / テキスト", accept: { "text/csv": [".csv"], "text/plain": [".txt"] } }],
          excludeAcceptAllOption: false,
          multiple: false,
        });
        if (handle) handleFile(await handle.getFile());
      } catch {
        /* ユーザーがキャンセルした場合は何もしない */
      }
      return;
    }
    // 非対応ブラウザは従来の <input type="file"> にフォールバック
    fileInputRef.current?.click();
  };

  const clearRoster = () => {
    setFileName(""); setHeaders([]); setRows([]); setCards(null); setError("");
    try { sessionStorage.removeItem(ROSTER_KEY); } catch { /* ignore */ }
  };

  const handleFile = async (file: File) => {
    setError(""); setCards(null);
    try {
      const parsed = await parseCsvFile(file);
      if (parsed.length < 2) { setError("データ行がありません"); return; }
      setFileName(file.name);
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      setMapping(guess(parsed[0]));
    } catch (e) {
      setError(`読み込み失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** この催事のDB名簿 (event_dm_recipients + customers) から
   *  住所つきリストを直接生成 → 宛名印刷。CSV再取込を不要にする。
   *  /dm 画面での取込結果を そのまま印刷に流用できるので二重作業回避。
   *  区分別の内訳 (例: 4-112 阪神百貨店 1,205件 / 9-69 お試し 478件) も表示。 */
  const loadFromEvent = async () => {
    if (!eventId) return;
    setBusy(true); setError(""); setCards(null); setSegBreakdown([]); setNoSegCount(0);
    try {
      // 1) 名簿の customer_id 一覧を取得 (1000件を超えても対応)
      const recipientIds: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("event_dm_recipients")
          .select("customer_id")
          .eq("event_id", eventId)
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        const part = (data as { customer_id: string }[]) || [];
        recipientIds.push(...part.map((r) => r.customer_id));
        if (part.length < 1000) break;
      }
      if (recipientIds.length === 0) {
        setError("この催事の名簿がまだありません。まず /dm 画面から CSVを取り込んでください。");
        return;
      }
      // 2) 顧客詳細を取得 (300件ずつチャンク)
      type CustRow = { id: string; customer_no: string; name: string; kana: string | null; postal_code: string | null; address: string | null; status: string };
      const custs: CustRow[] = [];
      // 顧客の所属区分も同時取得
      const custSegSet = new Map<string, Set<string>>(); // customer_id → Set<"kbn-code">
      for (let i = 0; i < recipientIds.length; i += 300) {
        const chunk = recipientIds.slice(i, i + 300);
        const [{ data: custData, error: custErr }, { data: segData, error: segErr }] = await Promise.all([
          supabase.from("customers").select("id, customer_no, name, kana, postal_code, address, status").in("id", chunk),
          supabase.from("customer_segments").select("customer_id, kbn_no, code").in("customer_id", chunk),
        ]);
        if (custErr) throw new Error(custErr.message);
        if (segErr) throw new Error(segErr.message);
        custs.push(...((custData as CustRow[]) || []));
        for (const r of (segData as { customer_id: string; kbn_no: number; code: number }[]) || []) {
          const k = `${r.kbn_no}-${r.code}`;
          if (!custSegSet.has(r.customer_id)) custSegSet.set(r.customer_id, new Set());
          custSegSet.get(r.customer_id)!.add(k);
        }
      }
      // 3) 「宛先不明」「削除候補」は印刷対象から自動除外 (DMハガキで戻ってこないよう)
      const valid = custs.filter((c) => c.status !== "宛先不明" && c.status !== "削除候補");
      const skipped = custs.length - valid.length;
      // 住所欠損チェック: 過去に「住所は使わない」で取込んだ場合 印刷不可
      const noAddrCount = valid.filter((c) => !c.address || !c.address.trim()).length;
      const noAddrRatio = valid.length > 0 ? noAddrCount / valid.length : 0;
      if (noAddrRatio >= 1.0) {
        // 全員住所なし → 印刷不可
        setError(
          `⚠️ 住所が登録されていない顧客が ${noAddrCount}人 (全員) います。\n` +
          `名簿取込時に「住所」列を「（使わない）」にしていた可能性があります。\n` +
          `/dm 画面で名簿を「置換モード」で再取込してください (住所も自動マッピングされます)。\n` +
          `急ぎの場合は 下の「CSVから読込」で直接印刷することもできます。`
        );
        setBusy(false);
        return;
      }
      // 一部だけ欠損 → 警告付きで続行
      if (noAddrCount > 0) {
        setError(
          `※ 住所未登録が ${noAddrCount}/${valid.length}人 います。この方々は宛名の住所欄が空白で印刷されます。`
        );
        // return しないで続行
      }
      // 4) QR生成 & Postcard 変換 (印刷対象=valid のみ)
      const list: Postcard[] = [];
      for (const c of valid) {
        const qr = await QRCode.toString(c.customer_no, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        list.push({
          no: c.customer_no,
          name: c.name || "",
          postal: c.postal_code || "",
          address: c.address || "",
          qr,
        });
      }
      // 顧客番号順にソート (印刷順を安定させる)
      list.sort((a, b) => a.no.localeCompare(b.no, "ja", { numeric: true }));
      setCards(list);
      setFileName(`（DBから読込・${eventLabel || "この催事"}・${list.length}件${skipped > 0 ? ` / 宛先不明等 ${skipped}件を除外` : ""}）`);

      // 5) 印刷対象 (valid) の区分別内訳を集計 & 区分名を引く
      const segCounts = new Map<string, number>(); // "kbn-code" → 印刷対象人数
      let noSeg = 0;
      for (const c of valid) {
        const keys = custSegSet.get(c.id);
        if (!keys || keys.size === 0) { noSeg++; continue; }
        for (const k of keys) segCounts.set(k, (segCounts.get(k) || 0) + 1);
      }
      // 区分名を引く: 出てきた区分キーだけを取得
      const uniqueSegKeys = Array.from(segCounts.keys());
      let nameMap = new Map<string, string>();
      if (uniqueSegKeys.length > 0) {
        // "9-69" 形式を kbn_no と code のペアに分解して or で問い合わせ
        const { data: segNames } = await supabase
          .from("sanchoku_segments")
          .select("kbn_no, code, segment_name")
          .or(uniqueSegKeys.map((k) => {
            const [kbn, code] = k.split("-");
            return `and(kbn_no.eq.${kbn},code.eq.${code})`;
          }).join(","));
        nameMap = new Map((segNames || []).map((s: { kbn_no: number; code: number; segment_name: string }) => [`${s.kbn_no}-${s.code}`, s.segment_name]));
      }
      const breakdown = uniqueSegKeys
        .map((k) => ({ key: k, name: nameMap.get(k) || "(未登録)", count: segCounts.get(k) || 0 }))
        .sort((a, b) => b.count - a.count);
      setSegBreakdown(breakdown);
      setNoSegCount(noSeg);
    } catch (e) {
      setError(`名簿読込に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const col = (row: string[], key: FieldKey): string => {
    const idx = mapping[key];
    if (idx === NONE) return "";
    return (row[Number(idx)] ?? "").trim();
  };

  const generate = async () => {
    if (mapping.customer_no === NONE || mapping.name === NONE) {
      setError("「顧客番号」と「氏名」の列を指定してください");
      return;
    }
    setBusy(true); setError("");
    try {
      const byNo = new Map<string, string[]>();
      for (const r of rows) {
        const no = col(r, "customer_no");
        if (!no) continue;
        byNo.set(no, r);
      }
      const list: Postcard[] = [];
      for (const [no, r] of byNo) {
        const main = [col(r, "pref"), col(r, "city"), col(r, "addr1")].filter(Boolean).join("");
        const tail = [col(r, "addr2"), col(r, "addr3")].filter(Boolean).join(" ");
        const qr = await QRCode.toString(no, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
        list.push({ no, name: col(r, "name"), postal: col(r, "postal"), address: [main, tail].filter(Boolean).join(" "), qr });
      }
      setCards(list);
    } catch (e) {
      setError(`QR生成に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const printWith = (cls: string) => {
    document.body.classList.add(cls);
    window.print();
    document.body.classList.remove(cls);
  };

  // 印刷用の宛名（クラス指定。qr-shift で面ごとの微調整を反映）
  const printAddr = (c: Postcard, q: number) => (
    <div className="qr-shift" style={shiftFor(q)}>
      {c.postal && <div className="qr-postal">{fmtPostal(c.postal)}</div>}
      <div className="qr-addr">{c.address}</div>
      <div className="qr-name">{c.name}　様</div>
      <div className="qr-qrcode" dangerouslySetInnerHTML={{ __html: c.qr }} />
      <div className="qr-no">{c.no}</div>
    </div>
  );

  const pages: Postcard[][] = [];
  if (cards) for (let i = 0; i < cards.length; i += 4) pages.push(cards.slice(i, i + 4));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          産直くんで区分抽出した名簿CSV（宛名つき）を読み込み、A4・4分割のはがきに<span className="font-semibold">宛名＋顧客番号QR</span>を印刷します。
          QRには顧客番号だけを入れ、住所などはこのブラウザ内で処理するだけで保存しません。
        </div>
      </div>

      {/* この催事の名簿から直接読込 (推奨・二重CSV取込回避) */}
      {eventId && (
        <div className="rounded-md border-2 border-emerald-400 bg-emerald-50/50 px-3 py-3 max-w-xl mx-auto space-y-2">
          <div className="flex items-start gap-2 text-sm text-emerald-900">
            <Database className="h-5 w-5 mt-0.5 shrink-0 text-emerald-700" />
            <div className="flex-1">
              <div className="font-bold">📋 この催事の名簿から自動読込（推奨）</div>
              <div className="text-xs mt-0.5">
                /dm 画面で登録済の名簿から 宛名リストを直接生成。
                <span className="font-medium">CSV再取込は不要</span>。宛先不明・削除候補は自動で除外。
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <Button
              onClick={loadFromEvent}
              disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Database className="h-4 w-4 mr-1" />
              {busy ? "読込中…" : "この催事の名簿から読込"}
            </Button>
          </div>

          {/* 区分別内訳: DBから読込 実行後に表示 */}
          {segBreakdown.length > 0 && (
            <div className="border-t border-emerald-300 pt-2 mt-2 space-y-1">
              <div className="text-xs font-bold text-emerald-800">📊 区分別 内訳（印刷対象・重複含む）</div>
              <ul className="text-xs space-y-0.5">
                {segBreakdown.map((s) => (
                  <li key={s.key} className="flex items-baseline gap-2 pl-4">
                    <span className="inline-block min-w-[70px] font-mono text-emerald-700">区{s.key}</span>
                    <span className="flex-1 truncate">{s.name}</span>
                    <span className="font-bold text-emerald-900 tabular-nums">{s.count.toLocaleString()}件</span>
                  </li>
                ))}
                {noSegCount > 0 && (
                  <li className="flex items-baseline gap-2 pl-4 text-muted-foreground">
                    <span className="inline-block min-w-[70px]">（区分なし）</span>
                    <span className="flex-1">-</span>
                    <span className="tabular-nums">{noSegCount.toLocaleString()}件</span>
                  </li>
                )}
              </ul>
              <p className="text-[10px] text-emerald-700/80 pl-4">
                ※ 同じ顧客が複数区分に所属する場合、各区分でカウントされます（合計は実人数より多くなることがあります）
              </p>
            </div>
          )}
        </div>
      )}

      {/* CSV アップロード (旧来。産直くんの新しいCSVで上書きしたい場合など補助的に使う) */}
      <div className="text-xs text-muted-foreground text-center max-w-xl mx-auto">
        または{eventId ? "、CSVから読込 (産直くんから直近抽出したCSVで一時的に印刷したい時)" : "CSVから読込"}:
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={pickFile}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickFile(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors max-w-xl mx-auto ${dragging ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
      >
        <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm">{fileName || (dragging ? "ここにCSVをドロップ" : "宛名つき名簿CSVを選択／ここにドラッグ＆ドロップ（Shift_JIS / UTF-8）")}</span>
        <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      </div>
      <p className="text-[11px] text-muted-foreground text-center max-w-xl mx-auto">
        初回は <span className="font-mono bg-muted px-1 rounded">…\はがき\★DMハガキ校正印刷\校正原稿</span> を開いてください。次回からはそのフォルダが最初に開きます。
      </p>
      {rows.length > 0 && (
        <p className="text-[11px] text-center max-w-xl mx-auto text-emerald-700">
          読み込み済み：<span className="font-medium">{fileName || "名簿"}</span>（{rows.length.toLocaleString()}件）。このブラウザの間は他のページ（文面／はがき）でも使えます。
          <button type="button" onClick={clearRoster} className="ml-2 text-muted-foreground hover:text-foreground underline">クリア</button>
        </p>
      )}

      {headers.length > 0 && (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm font-medium">列の割り当て（自動で推測。違っていたら直してください）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">{f.label}{f.required && <span className="text-destructive ml-1">必須</span>}</Label>
                  <select
                    value={mapping[f.key]}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full h-9 rounded-md border border-input bg-white px-2 text-sm"
                  >
                    <option value={NONE}>（使わない）</option>
                    {headers.map((h, i) => <option key={i} value={String(i)}>{h || `列${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground">データ行数: {rows.length.toLocaleString()}（同じ顧客番号は1枚にまとめます）</div>
            <Button onClick={generate} disabled={busy}>{busy ? "生成中…" : "プレビューを作成"}</Button>
            {error && <div className="text-sm text-destructive">{error}</div>}
          </CardContent>
        </Card>
      )}

      {/* 面ごとの位置微調整（テンプレの枠に合わせる） */}
      {cards && (
        <div className="space-y-1">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              📮 <span className="font-medium">宛名エリア</span>の位置を面ごとに微調整（mm／＋横=右・＋縦=下）
            </span>
            <button
              type="button"
              onClick={savePositions}
              title="この位置を保存（この端末）"
              className={cn(
                "inline-flex items-center justify-center h-10 w-10 rounded-full border cursor-pointer transition-transform hover:scale-110 active:scale-95",
                dirty ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse" : "bg-muted/50 border-border text-primary hover:bg-muted"
              )}
            >
              <Save className="h-6 w-6" />
            </button>
            {posSaved && <span className="text-xs text-emerald-700 font-medium">✓ 保存しました</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
            {QUAD_LABELS.map((lbl, i) => (
              <div key={i} className="flex items-center gap-1 border rounded-md px-2 py-1 text-xs">
                <span className="w-8 font-medium shrink-0">{lbl}</span>
                <span>横</span>
                <input type="number" step={0.5} value={quadOffsets[i].dx} onChange={(e) => setQuad(i, "dx", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
                <span>縦</span>
                <input type="number" step={0.5} value={quadOffsets[i].dy} onChange={(e) => setQuad(i, "dy", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 文面(出店のご案内)エリアの面ごと微調整 — frontOverlay がある時のみ */}
      {cards && frontOverlay && (
        <div className="space-y-1 border-t pt-3">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              📝 <span className="font-medium">出店のご案内（文面）エリア</span>の位置を面ごとに微調整（mm／＋横=右・＋縦=下）
            </span>
            <button
              type="button"
              onClick={saveMsgPositions}
              title="この位置を保存（この端末）"
              className={cn(
                "inline-flex items-center justify-center h-10 w-10 rounded-full border cursor-pointer transition-transform hover:scale-110 active:scale-95",
                msgDirty ? "bg-orange-50 border-orange-300 text-orange-600 animate-pulse" : "bg-muted/50 border-border text-primary hover:bg-muted"
              )}
            >
              <Save className="h-6 w-6" />
            </button>
            {msgPosSaved && <span className="text-xs text-emerald-700 font-medium">✓ 保存しました</span>}
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
            {QUAD_LABELS.map((lbl, i) => (
              <div key={i} className="flex items-center gap-1 border rounded-md px-2 py-1 text-xs">
                <span className="w-8 font-medium shrink-0">{lbl}</span>
                <span>横</span>
                <input type="number" step={0.5} value={msgOffsets[i].dx} onChange={(e) => setMsgQuad(i, "dx", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
                <span>縦</span>
                <input type="number" step={0.5} value={msgOffsets[i].dy} onChange={(e) => setMsgQuad(i, "dy", parseFloat(e.target.value) || 0)} className="h-7 w-14 rounded border border-input bg-white px-1" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 仕上がりプレビュー（4面） — タブで うら面(文面)/おもて面(宛名) 切替 */}
      {cards && cards.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground text-center">
            {frontOverlay ? "おもて面プレビュー（宛名＋出店情報・4面）" : "宛名プレビュー（4面）"}。位置微調整が反映されます
          </div>
          <div className="overflow-auto">
            <div className="w-fit mx-auto" style={{ zoom: 0.6 } as React.CSSProperties}>
              <div className="grid grid-cols-2 border-l border-t" style={{ width: "210mm" }}>
                {[0, 1, 2, 3].map((q) => {
                  const c = (pages[0] || [])[q];
                  return (
                    <div key={q} className="relative bg-white border-r border-b overflow-hidden" style={{ width: "105mm", height: "148.5mm" }}>
                      <span className="absolute top-0 left-0 z-10 bg-white/80 px-1 text-muted-foreground" style={{ fontSize: "9pt" }}>{QUAD_LABELS[q]}</span>
                      {frontOverlay && (
                        <div style={{ position: "absolute", inset: 0, ...msgShiftFor(q) }}>{frontOverlay}</div>
                      )}
                      {c ? cardInner(c, q) : <span className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">（データなし）</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* まとめて印刷 */}
      {cards && (
        <div className="rounded-md border bg-muted/20 p-3 space-y-2 max-w-xl mx-auto">
          <div className="text-sm font-bold text-center">🖨️ まとめて印刷</div>
          {frontOverlay ? (
            <>
              <div className="text-xs text-muted-foreground text-center">裏面（チラシ）印刷済みのA4厚紙に、おもて面（宛名＋出店情報）を印刷します（{cards.length}件 / {pages.length}ページ）。</div>
              <div className="flex justify-center">
                <Button onClick={() => printWith("pp-both")}>
                  <Printer className="h-4 w-4 mr-1" />おもて面を印刷
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-center">
              <Button onClick={() => printWith("pp-address")}>
                <Printer className="h-4 w-4 mr-1" />宛名を印刷（{cards.length}枚 / {pages.length}ページ）
              </Button>
            </div>
          )}
          <div className="text-[11px] text-muted-foreground text-center">印刷ダイアログで「余白なし」「等倍(100%)」に。PDFに保存も可。</div>
        </div>
      )}

      {/* 印刷レイアウト — body直下にポータルで出す（body.pp-address のときだけ印刷） */}
      {cards && (
        <PrintPortal>
          <div className="qr-print">
            <style>{`
              .qr-print, .qr-print-both { display: none; }
              @media print {
                @page { size: A4 portrait; margin: 0; }
                body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body.pp-address .qr-print { display: block !important; margin: 0; }
                body.pp-both .qr-print-both { display: block !important; margin: 0; }
                .qr-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; }
                /* 差出人=左上／郵便枠=右上 はテンプレ側。郵便番号は右上の枠、宛名はその下 */
                .qr-card { position: relative; box-sizing: border-box; overflow: hidden; }
                .qr-shift { position: absolute; inset: 0; }
                .qr-postal { position: absolute; top: 21mm; left: 30mm; width: 65mm; font-size: 11pt; }
                .qr-addr { position: absolute; top: 27mm; left: 30mm; width: 65mm; font-size: 11pt; line-height: 1.5; }
                .qr-name { position: absolute; top: 46mm; left: 30mm; width: 65mm; font-size: 14pt; }
                .qr-qrcode { position: absolute; top: 55mm; right: 10mm; width: 18mm; height: 18mm; }
                .qr-qrcode svg { width: 100%; height: 100%; }
                .qr-no { position: absolute; top: 73mm; right: 8mm; width: 22mm; text-align: center; font-size: 9pt; color: #333; }
              }
            `}</style>
            {pages.map((page, pi) => (
              <div key={pi} className="qr-sheet">
                {page.map((c, ci) => (
                  <div key={c.no} className="qr-card">{printAddr(c, ci % 4)}</div>
                ))}
              </div>
            ))}
          </div>
          {/* まとめ印刷: 宛名＋文面（文面は全面共通の内容だが、面ごとに位置微調整） */}
          {frontOverlay && (
            <div className="qr-print-both">
              {pages.map((page, pi) => (
                <div key={pi} className="qr-sheet">
                  {page.map((c, ci) => {
                    const q = ci % 4;
                    return (
                      <div key={c.no} className="qr-card">
                        <div className="qr-shift" style={msgShiftFor(q)}>{frontOverlay}</div>
                        {printAddr(c, q)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </PrintPortal>
      )}
    </div>
  );
}
