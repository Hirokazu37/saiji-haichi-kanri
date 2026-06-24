"use client";

import { useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Printer, Info, ArrowLeft } from "lucide-react";
import { parseCsvFile } from "@/lib/csv";
import { usePermission } from "@/hooks/usePermission";

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

const fmtPostal = (p: string) => {
  const d = p.replace(/[^0-9]/g, "");
  return d.length === 7 ? `${d.slice(0, 3)}-${d.slice(3)}` : p;
};

export default function PostcardPrintPage() {
  const { role } = usePermission();
  const canUse = role === "admin" || role === "viewer";
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<FieldKey, string>>(() => {
    const m = {} as Record<FieldKey, string>;
    for (const f of FIELDS) m[f.key] = NONE;
    return m;
  });
  const [cards, setCards] = useState<Postcard[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      // 同一顧客番号の重複は1枚にまとめる
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
        list.push({
          no,
          name: col(r, "name"),
          postal: col(r, "postal"),
          address: [main, tail].filter(Boolean).join(" "),
          qr,
        });
      }
      setCards(list);
    } catch (e) {
      setError(`QR生成に失敗: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // 4枚ずつA4 1ページに割り付け
  const pages: Postcard[][] = [];
  if (cards) for (let i = 0; i < cards.length; i += 4) pages.push(cards.slice(i, i + 4));

  if (!canUse) {
    return <p className="text-sm text-muted-foreground">この機能を使う権限がありません。</p>;
  }

  return (
    <div className="space-y-4 pb-8">
      {/* 画面UI（印刷時は隠す） */}
      <div className="print:hidden space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/dm" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />DMハガキ一覧へ
          </Link>
        </div>
        <h1 className="text-2xl font-bold">QR付きはがき印刷</h1>

        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
          <div>
            産直くんで区分抽出した名簿CSV（宛名つき）を読み込み、A4・4分割のはがきに<span className="font-semibold">宛名＋顧客番号QR</span>を印刷します。
            QRには顧客番号だけを入れ、住所などはこのブラウザ内で処理するだけで保存しません。来場登録はUSBのQRリーダーで読み取れます。
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors max-w-xl">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm">{fileName || "CSVファイルを選択（Shift_JIS / UTF-8）"}</span>
          <input type="file" accept=".csv,.txt" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </label>

        {headers.length > 0 && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="text-sm font-medium">列の割り当て（自動で推測。違っていたら直してください）</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
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

        {cards && (
          <div className="flex items-center gap-3">
            <Button onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />印刷する（{cards.length}枚 / {pages.length}ページ）
            </Button>
            <span className="text-xs text-muted-foreground">
              印刷ダイアログで「余白なし」「等倍(100%)」に設定し、A4厚紙に印刷して4分割してください。試し刷りで位置を確認してから本番印刷を。
            </span>
          </div>
        )}
      </div>

      {/* 印刷レイアウト */}
      {cards && (
        <div className="postcard-print">
          <style>{`
            .postcard-print { display: none; }
            @media print {
              @page { size: A4 portrait; margin: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              nav, aside, header, [data-slot="bottom-nav"] { display: none !important; }
              .print\\:hidden { display: none !important; }
              .postcard-print { display: block !important; }
              .pc-sheet { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; }
              .pc-card { position: relative; box-sizing: border-box; padding: 12mm 10mm; overflow: hidden; }
              .pc-postal { font-size: 14pt; letter-spacing: 2px; }
              .pc-addr { font-size: 11pt; margin-top: 6mm; line-height: 1.5; }
              .pc-name { font-size: 16pt; font-weight: bold; margin-top: 10mm; }
              .pc-qr { position: absolute; bottom: 10mm; right: 10mm; width: 20mm; height: 20mm; }
              .pc-qr svg { width: 100%; height: 100%; }
              .pc-no { position: absolute; bottom: 7mm; right: 10mm; width: 20mm; text-align: center; font-size: 7pt; color: #333; }
            }
          `}</style>
          {pages.map((page, pi) => (
            <div key={pi} className="pc-sheet">
              {page.map((c) => (
                <div key={c.no} className="pc-card">
                  {c.postal && <div className="pc-postal">〒{fmtPostal(c.postal)}</div>}
                  <div className="pc-addr">{c.address}</div>
                  <div className="pc-name">{c.name}　様</div>
                  <div className="pc-qr" dangerouslySetInnerHTML={{ __html: c.qr }} />
                  <div className="pc-no">{c.no}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
