"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { parseCsvFile } from "@/lib/csv";
import { Upload, FileSpreadsheet } from "lucide-react";

/** マッピング対象の基本項目 */
const BASE_FIELDS = [
  { key: "customer_no", label: "顧客番号（得意先コード）", required: true },
  { key: "name", label: "氏名", required: true },
  { key: "kana", label: "カナ（フリガナ）", required: false },
  { key: "postal_code", label: "郵便番号", required: false },
  { key: "address", label: "住所", required: false },
  { key: "phone", label: "電話番号", required: false },
] as const;

type BaseFieldKey = (typeof BASE_FIELDS)[number]["key"];

const SEGMENT_KBNS = [3, 4, 5, 6, 7, 8, 9, 10];

const NONE = "__none__";

/** ヘッダー名から対応列を推測する */
function guessMapping(headers: string[]) {
  const base: Record<BaseFieldKey, string> = {
    customer_no: NONE, name: NONE, kana: NONE, postal_code: NONE, address: NONE, phone: NONE,
  };
  const seg: Record<number, string> = {};
  const patterns: [BaseFieldKey, RegExp][] = [
    ["customer_no", /得意先コード|得意先CD|顧客番号|顧客コード|顧客No|会員番号|^コード$/i],
    ["kana", /カナ|かな|フリガナ|ふりがな/],
    ["name", /氏名|名前|得意先名|顧客名/],
    ["postal_code", /郵便|〒/],
    ["address", /住所/],
    ["phone", /電話|TEL/i],
  ];
  headers.forEach((h, i) => {
    const idx = String(i);
    for (const [key, re] of patterns) {
      if (base[key] === NONE && re.test(h)) {
        // 氏名はカナ列を誤って拾わないように
        if (key === "name" && /カナ|かな|フリガナ/.test(h)) continue;
        base[key] = idx;
        break;
      }
    }
    const m = h.match(/(?:汎用)?(?:マスター)?区分\s*([3-9]|10)\b/);
    if (m) {
      const kbn = Number(m[1]);
      if (seg[kbn] === undefined) seg[kbn] = idx;
    }
  });
  return { base, seg };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
};

export function CustomerImportDialog({ open, onOpenChange, onImported }: Props) {
  const supabase = createClient();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<BaseFieldKey, string>>({
    customer_no: NONE, name: NONE, kana: NONE, postal_code: NONE, address: NONE, phone: NONE,
  });
  const [segMapping, setSegMapping] = useState<Record<number, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const reset = () => {
    setFileName(""); setHeaders([]); setRows([]); setError(""); setResult(""); setProgress("");
    setMapping({ customer_no: NONE, name: NONE, kana: NONE, postal_code: NONE, address: NONE, phone: NONE });
    setSegMapping({});
  };

  const handleFile = async (file: File) => {
    setError(""); setResult("");
    try {
      const parsed = await parseCsvFile(file);
      if (parsed.length < 2) {
        setError("データ行がありません（1行目はヘッダーとして扱います）");
        return;
      }
      setFileName(file.name);
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      const guessed = guessMapping(parsed[0]);
      setMapping(guessed.base);
      setSegMapping(guessed.seg);
    } catch (e) {
      setError(`ファイルの読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const col = (row: string[], key: BaseFieldKey): string | null => {
    const idx = mapping[key];
    if (idx === NONE) return null;
    const v = (row[Number(idx)] ?? "").trim();
    return v === "" ? null : v;
  };

  const handleImport = async () => {
    if (mapping.customer_no === NONE || mapping.name === NONE) {
      setError("「顧客番号」と「氏名」の列を指定してください");
      return;
    }
    setImporting(true); setError(""); setResult("");
    try {
      const now = new Date().toISOString();
      // CSV行 → 顧客レコード (同一番号は後の行が優先)
      const byNo = new Map<string, { customer_no: string; name: string; kana: string | null; postal_code: string | null; address: string | null; phone: string | null; imported_at: string }>();
      const segByNo = new Map<string, { kbn_no: number; code: number }[]>();
      let skipped = 0;
      for (const row of rows) {
        const no = col(row, "customer_no");
        const name = col(row, "name");
        if (!no || !name) { skipped++; continue; }
        byNo.set(no, {
          customer_no: no,
          name,
          kana: col(row, "kana"),
          postal_code: col(row, "postal_code"),
          address: col(row, "address"),
          phone: col(row, "phone"),
          imported_at: now,
        });
        const segs: { kbn_no: number; code: number }[] = [];
        for (const kbn of SEGMENT_KBNS) {
          const idx = segMapping[kbn];
          if (idx === undefined || idx === NONE) continue;
          const raw = (row[Number(idx)] ?? "").trim();
          const code = Number(raw);
          if (raw !== "" && Number.isInteger(code) && code > 0) segs.push({ kbn_no: kbn, code });
        }
        segByNo.set(no, segs);
      }
      const records = Array.from(byNo.values());
      if (records.length === 0) {
        setError("取り込める行がありませんでした");
        setImporting(false);
        return;
      }

      // 1. 顧客を upsert (500件ずつ)
      const recChunks = chunk(records, 500);
      for (let i = 0; i < recChunks.length; i++) {
        setProgress(`顧客を登録中… ${Math.round(((i + 1) / recChunks.length) * 100)}%`);
        const { error: upErr } = await supabase
          .from("customers")
          .upsert(recChunks[i], { onConflict: "customer_no" });
        if (upErr) throw new Error(upErr.message);
      }

      // 2. 区分列が指定されていれば、取込顧客の区分を入れ替える
      const hasSegCols = SEGMENT_KBNS.some((k) => segMapping[k] !== undefined && segMapping[k] !== NONE);
      if (hasSegCols) {
        // 顧客番号 → id を取得
        const idByNo = new Map<string, string>();
        const noChunks = chunk(Array.from(byNo.keys()), 300);
        for (let i = 0; i < noChunks.length; i++) {
          setProgress(`顧客IDを照合中… ${Math.round(((i + 1) / noChunks.length) * 100)}%`);
          const { data, error: selErr } = await supabase
            .from("customers")
            .select("id, customer_no")
            .in("customer_no", noChunks[i]);
          if (selErr) throw new Error(selErr.message);
          for (const r of data || []) idByNo.set(r.customer_no, r.id);
        }
        // 既存区分を削除して再挿入
        const allIds = Array.from(idByNo.values());
        const idChunks = chunk(allIds, 300);
        for (let i = 0; i < idChunks.length; i++) {
          setProgress(`既存の区分を整理中… ${Math.round(((i + 1) / idChunks.length) * 100)}%`);
          const { error: delErr } = await supabase
            .from("customer_segments")
            .delete()
            .in("customer_id", idChunks[i]);
          if (delErr) throw new Error(delErr.message);
        }
        const segRows: { customer_id: string; kbn_no: number; code: number }[] = [];
        for (const [no, segs] of segByNo) {
          const id = idByNo.get(no);
          if (!id) continue;
          for (const s of segs) segRows.push({ customer_id: id, ...s });
        }
        const segChunks = chunk(segRows, 1000);
        for (let i = 0; i < segChunks.length; i++) {
          setProgress(`区分を登録中… ${Math.round(((i + 1) / segChunks.length) * 100)}%`);
          const { error: insErr } = await supabase.from("customer_segments").insert(segChunks[i]);
          if (insErr) throw new Error(insErr.message);
        }
      }

      setProgress("");
      setResult(`${records.length.toLocaleString()}件を取り込みました${skipped > 0 ? `（番号または氏名が空の ${skipped} 行はスキップ）` : ""}`);
      onImported();
    } catch (e) {
      setError(`取込中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const colSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="（使わない）" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>（使わない）</SelectItem>
        {headers.map((h, i) => (
          <SelectItem key={i} value={String(i)}>
            {h || `列${i + 1}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!importing) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>産直くんCSVの取込</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            産直くん11からエクスポートした得意先のCSVを選んでください（Shift_JIS / UTF-8 どちらでも可）。
            同じ顧客番号は上書き更新されるので、何度でも取り込み直せます。
          </div>

          <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">{fileName || "CSVファイルを選択"}</span>
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </label>

          {headers.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">列の割り当て（自動で推測しています。違っていたら直してください）</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {BASE_FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label className="text-xs">
                        {f.label}
                        {f.required && <span className="text-destructive ml-1">必須</span>}
                      </Label>
                      {colSelect(mapping[f.key], (v) => setMapping((prev) => ({ ...prev, [f.key]: v })))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">DM区分の列（汎用マスター区分 3〜10。コード値が入っている列）</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {SEGMENT_KBNS.map((kbn) => (
                    <div key={kbn} className="space-y-1">
                      <Label className="text-xs">区分{kbn}</Label>
                      {colSelect(segMapping[kbn] ?? NONE, (v) => setSegMapping((prev) => ({ ...prev, [kbn]: v })))}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">プレビュー（先頭3行）</div>
                <div className="overflow-x-auto border rounded-md">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-muted">
                        {headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 text-left whitespace-nowrap font-medium">{h || `列${i + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((r, ri) => (
                        <tr key={ri} className="border-t">
                          {headers.map((_, ci) => (
                            <td key={ci} className="px-2 py-1 whitespace-nowrap">{r[ci] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-xs text-muted-foreground">データ行数: {rows.length.toLocaleString()}</div>
              </div>
            </>
          )}

          {progress && <div className="text-sm text-primary">{progress}</div>}
          {error && <div className="text-sm text-destructive whitespace-pre-wrap">{error}</div>}
          {result && <div className="text-sm text-green-600 font-medium">{result}</div>}
        </div>

        <DialogFooter>
          <DialogClose><Button variant="outline" disabled={importing}>閉じる</Button></DialogClose>
          <Button onClick={handleImport} disabled={importing || rows.length === 0}>
            <Upload className="h-4 w-4 mr-1" />
            {importing ? "取込中…" : "取り込む"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
