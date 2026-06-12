"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { parseCsvFile } from "@/lib/csv";
import { Upload, FileSpreadsheet } from "lucide-react";
import { segKey, type SegmentMaster } from "./types";

/** マッピング対象の基本項目（住所は複数列を結合して保存する） */
const BASE_FIELDS = [
  { key: "customer_no", label: "顧客番号（得意先コード）", required: true },
  { key: "name", label: "氏名", required: true },
  { key: "kana", label: "カナ（フリガナ）", required: false },
  { key: "postal_code", label: "郵便番号", required: false },
  { key: "pref", label: "住所（都道府県）", required: false },
  { key: "city", label: "住所（市区町村）", required: false },
  { key: "address1", label: "住所１", required: false },
  { key: "address2", label: "住所２（建物名など）", required: false },
  { key: "address3", label: "住所３", required: false },
  { key: "phone", label: "電話番号", required: false },
] as const;

type BaseFieldKey = (typeof BASE_FIELDS)[number]["key"];

const SEGMENT_KBNS = [3, 4, 5, 6, 7, 8, 9, 10];

const NONE = "__none__";

/** ヘッダー名から対応列を推測する */
const EMPTY_MAPPING: Record<BaseFieldKey, string> = {
  customer_no: NONE, name: NONE, kana: NONE, postal_code: NONE,
  pref: NONE, city: NONE, address1: NONE, address2: NONE, address3: NONE, phone: NONE,
};

function guessMapping(headers: string[]) {
  const base: Record<BaseFieldKey, string> = { ...EMPTY_MAPPING };
  const seg: Record<number, string> = {};
  const patterns: [BaseFieldKey, RegExp][] = [
    ["customer_no", /得意先コード|得意先CD|顧客番号|顧客コード|顧客No|会員番号|^コード$/i],
    ["kana", /カナ|かな|フリガナ|ふりがな/],
    ["name", /氏名|名前|得意先名|顧客名/],
    ["postal_code", /郵便|〒/],
    ["pref", /都道府県/],
    ["city", /市区町村|市町村/],
    ["address1", /住所[1１]|^住所$|得意先住所$/],
    ["address2", /住所[2２]/],
    ["address3", /住所[3３]/],
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

/** ファイル名から区分を推測する（「3-104」形式 or 区分名の最長一致） */
function suggestSegmentFromFilename(
  fileName: string,
  segments: SegmentMaster[]
): SegmentMaster | null {
  const base = fileName.replace(/\.[^.]+$/, "");
  // ① 「3-104」「3_104」のような 区分番号-コード
  const m = base.match(/(10|[3-9])\s*[-_－―‐]\s*(\d{1,3})/);
  if (m) {
    const hit = segments.find((s) => s.kbn_no === Number(m[1]) && s.code === Number(m[2]));
    if (hit) return hit;
  }
  // ② 区分名がファイル名に含まれる（最も長い名前を優先）
  const norm = (s: string) => s.replace(/[\s　]/g, "");
  const nb = norm(base);
  let best: SegmentMaster | null = null;
  for (const s of segments) {
    const n = norm(s.segment_name);
    if (n.length >= 2 && nb.includes(n)) {
      if (!best || n.length > norm(best.segment_name).length) best = s;
    }
  }
  return best;
}

type ImportLog = {
  id: string;
  file_name: string;
  imported_count: number;
  segment_label: string | null;
  imported_by: string | null;
  created_at: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  segments: SegmentMaster[];
  /** 指定すると「この催事のDM名簿」として取込（名簿が催事にひも付く） */
  event?: { id: string; label: string } | null;
  /** 催事モード時に最初から選んでおく区分キー ("kbn-code") */
  defaultSegKey?: string;
};

export function CustomerImportDialog({ open, onOpenChange, onImported, segments, event = null, defaultSegKey }: Props) {
  const supabase = createClient();
  const { displayName } = usePermission();
  const [fileName, setFileName] = useState("");
  // 産直くんの出力ファイル名は「DMハガキ出力用.csv」固定のため、
  // 古いエクスポートの取り違え防止としてファイル更新日時を表示・警告する
  const [fileMtime, setFileMtime] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<BaseFieldKey, string>>({ ...EMPTY_MAPPING });
  const [segMapping, setSegMapping] = useState<Record<number, string>>({});
  const [segMode, setSegMode] = useState<"fixed" | "columns">("fixed");
  const [fixedSeg, setFixedSeg] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [recentLogs, setRecentLogs] = useState<ImportLog[]>([]);
  // 催事モード: 取込人数でDM枚数を更新するか
  const [updateDmCount, setUpdateDmCount] = useState(true);
  const [importing, setImporting] = useState(false);

  // 開いたとき、催事にひも付いた区分があれば最初から選んでおく
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && defaultSegKey) setFixedSeg(defaultSegKey);
  }
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const reset = () => {
    setFileName(""); setFileMtime(null); setHeaders([]); setRows([]); setError(""); setResult(""); setProgress("");
    setMapping({ ...EMPTY_MAPPING });
    setSegMapping({});
    setSegMode("fixed");
    setFixedSeg("");
    setSuggestNote("");
    setUpdateDmCount(true);
  };

  // ダイアログを開いたら直近の取込履歴を読む
  useEffect(() => {
    if (!open) return;
    supabase
      .from("customer_import_logs")
      .select("id, file_name, imported_count, segment_label, imported_by, created_at")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setRecentLogs((data as ImportLog[]) || []));
  }, [open, supabase]);

  const segItems: ComboboxItem[] = segments.map((s) => ({
    value: segKey(s.kbn_no, s.code),
    label: s.segment_name,
    group: `区分${s.kbn_no}`,
    sublabel: `${s.kbn_no}-${s.code}`,
  }));

  const handleFile = async (file: File) => {
    setError(""); setResult("");
    try {
      const parsed = await parseCsvFile(file);
      if (parsed.length < 2) {
        setError("データ行がありません（1行目はヘッダーとして扱います）");
        return;
      }
      setFileName(file.name);
      setFileMtime(file.lastModified || null);
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      const guessed = guessMapping(parsed[0]);
      setMapping(guessed.base);
      setSegMapping(guessed.seg);
      // 区分らしい列がCSVにあれば「列から読む」モードに自動切替
      if (Object.keys(guessed.seg).length > 0) {
        setSegMode("columns");
        setSuggestNote("");
      } else {
        // ファイル名から区分を推測（例: 「3-104」や「池袋東武」を含むファイル名）
        const hit = suggestSegmentFromFilename(file.name, segments);
        if (hit) {
          setFixedSeg(segKey(hit.kbn_no, hit.code));
          setSuggestNote(`ファイル名から「${hit.segment_name}」（${hit.kbn_no}-${hit.code}）と推測しました。違う場合は変更してください。`);
        } else {
          setSuggestNote("");
        }
      }
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
    const fixedSegMaster = segMode === "fixed"
      ? segments.find((s) => segKey(s.kbn_no, s.code) === fixedSeg) || null
      : null;
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
        // 住所は 都道府県+市区町村+住所1 を連結し、建物名(住所2,3)はスペース区切りで続ける
        const addrMain = [col(row, "pref"), col(row, "city"), col(row, "address1")]
          .filter(Boolean).join("");
        const addrTail = [col(row, "address2"), col(row, "address3")]
          .filter(Boolean).join(" ");
        byNo.set(no, {
          customer_no: no,
          name,
          kana: col(row, "kana"),
          postal_code: col(row, "postal_code"),
          address: [addrMain, addrTail].filter((s) => s !== "").join(" ") || null,
          phone: col(row, "phone"),
          imported_at: now,
        });
        if (segMode === "columns") {
          const segs: { kbn_no: number; code: number }[] = [];
          for (const kbn of SEGMENT_KBNS) {
            const idx = segMapping[kbn];
            if (idx === undefined || idx === NONE) continue;
            const raw = (row[Number(idx)] ?? "").trim();
            const code = Number(raw);
            if (raw !== "" && Number.isInteger(code) && code > 0) segs.push({ kbn_no: kbn, code });
          }
          segByNo.set(no, segs);
        } else if (fixedSegMaster) {
          segByNo.set(no, [{ kbn_no: fixedSegMaster.kbn_no, code: fixedSegMaster.code }]);
        }
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

      // 2. 区分の紐付け / 催事名簿の登録に使う 顧客番号 → id を取得
      //    - 列モード: CSVの区分列を正として、取込顧客の区分を全入れ替え
      //    - 指定モード: 選んだ区分だけを追加・更新（他の区分は保持）
      const hasSegCols = SEGMENT_KBNS.some((k) => segMapping[k] !== undefined && segMapping[k] !== NONE);
      const writeSegs = (segMode === "columns" && hasSegCols) || fixedSegMaster !== null;
      const idByNo = new Map<string, string>();
      if (writeSegs || event) {
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
      }
      if (writeSegs) {
        // 列モードのみ: 既存区分を削除してから入れ直す
        if (segMode === "columns") {
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
          const { error: insErr } = await supabase
            .from("customer_segments")
            .upsert(segChunks[i], { onConflict: "customer_id,kbn_no" });
          if (insErr) throw new Error(insErr.message);
        }
      }

      // 3. 催事モード: 名簿を催事にひも付け、必要ならDM枚数も更新
      if (event) {
        const recipientRows = Array.from(byNo.keys())
          .map((no) => idByNo.get(no))
          .filter((id): id is string => !!id)
          .map((customer_id) => ({ event_id: event.id, customer_id }));
        const recChunks2 = chunk(recipientRows, 500);
        for (let i = 0; i < recChunks2.length; i++) {
          setProgress(`名簿を催事にひも付け中… ${Math.round(((i + 1) / recChunks2.length) * 100)}%`);
          const { error: rcErr } = await supabase
            .from("event_dm_recipients")
            .upsert(recChunks2[i], { onConflict: "event_id,customer_id", ignoreDuplicates: true });
          if (rcErr) throw new Error(rcErr.message);
        }
        if (updateDmCount) {
          await supabase.from("events").update({ dm_count: records.length }).eq("id", event.id);
        }
      }

      setProgress("");
      // 取込履歴を記録（取り違えに後から気付けるように）
      await supabase.from("customer_import_logs").insert({
        file_name: fileName,
        total_rows: rows.length,
        imported_count: records.length,
        skipped_count: skipped,
        kbn_no: fixedSegMaster?.kbn_no ?? null,
        code: fixedSegMaster?.code ?? null,
        segment_label: event
          ? `名簿: ${event.label}${fixedSegMaster ? ` / ${fixedSegMaster.segment_name}` : ""}`
          : fixedSegMaster
          ? `${fixedSegMaster.kbn_no}-${fixedSegMaster.code} ${fixedSegMaster.segment_name}`
          : segMode === "columns" && hasSegCols ? "CSVの区分列から読取" : "区分紐付けなし",
        mode: segMode,
        imported_by: displayName || null,
        event_id: event?.id ?? null,
      });
      const segNote = event
        ? `「${event.label}」の名簿として`
        : fixedSegMaster ? `「${fixedSegMaster.segment_name}」に紐付けて` : "";
      setResult(`${records.length.toLocaleString()}件を${segNote}取り込みました${skipped > 0 ? `（番号または氏名が空の ${skipped} 行はスキップ）` : ""}`);
      onImported();
      // 履歴表示を更新
      const { data: logs } = await supabase
        .from("customer_import_logs")
        .select("id, file_name, imported_count, segment_label, imported_by, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentLogs((logs as ImportLog[]) || []);
    } catch (e) {
      setError(`取込中にエラーが発生しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const colSelect = (value: string, onChange: (v: string) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v ?? NONE)}>
      <SelectTrigger className="w-full">
        <SelectValue>
          {value === NONE ? "（使わない）" : headers[Number(value)] || `列${Number(value) + 1}`}
        </SelectValue>
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
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? `DM名簿CSVの取込 — ${event.label}` : "マスタ一括取込（補助）"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!event && (
            <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              催事のDM名簿の取込は、ここではなく「DMハガキ」画面の各催事の「名簿」ボタンから行ってください。
              この画面は催事にひも付けない補助用（初回の一括登録／区分の付け直し／住所変更などの情報更新）です。
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {event
              ? "この催事のDMに使った名簿CSV（産直くんで区分抽出したもの）を選んでください。名簿のお客様がこの催事にひも付き、来場登録時の照合や反応率に使われます。"
              : "産直くん11からエクスポートした得意先のCSVを選んでください（Shift_JIS / UTF-8 どちらでも可）。同じ顧客番号は上書き更新されるので、何度でも取り込み直せます。"}
          </div>

          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (!f) return;
              if (!/\.(csv|txt)$/i.test(f.name)) {
                setError("CSVファイル（.csv / .txt）をドロップしてください");
                return;
              }
              handleFile(f);
            }}
            className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">
              {fileName || (dragging ? "ここにドロップして取込" : "CSVファイルを選択（ここにドラッグ＆ドロップも可）")}
            </span>
            <input
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </label>

          {fileMtime != null && (() => {
            const ageMs = Date.now() - fileMtime;
            const isStale = ageMs > 24 * 60 * 60 * 1000;
            const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
            const stamp = new Date(fileMtime).toLocaleString("ja-JP", {
              year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            });
            return isStale ? (
              <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                ⚠ このファイルは {ageDays >= 1 ? `${ageDays}日以上前` : "昨日以前"} に作られたものです（{stamp}）。
                産直くんの出力ファイル名は毎回同じなので、最新のエクスポートか確認してください。
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">ファイルの作成/更新日時: {stamp}</div>
            );
          })()}

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
                <div className="text-sm font-medium">DM区分（百貨店）の紐付け</div>
                <Select value={segMode} onValueChange={(v) => setSegMode((v as "fixed" | "columns") || "fixed")}>
                  <SelectTrigger className="w-full md:w-96">
                    <SelectValue>
                      {segMode === "fixed"
                        ? "この名簿の全員を、選んだ区分に紐付ける（区分指定で抽出したCSV）"
                        : "CSVの中にある区分3〜10の列から読み取る"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">この名簿の全員を、選んだ区分に紐付ける（区分指定で抽出したCSV）</SelectItem>
                    <SelectItem value="columns">CSVの中にある区分3〜10の列から読み取る</SelectItem>
                  </SelectContent>
                </Select>
                {segMode === "fixed" ? (
                  <div className="space-y-1">
                    <Combobox
                      items={segItems}
                      value={fixedSeg}
                      onChange={(v) => { setFixedSeg(v); setSuggestNote(""); }}
                      placeholder="区分（百貨店）を選択"
                      searchPlaceholder="百貨店名で検索"
                      allowCustom={false}
                      className="w-full md:w-96"
                    />
                    {suggestNote && (
                      <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                        {suggestNote}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      産直くんで「区分5の○○百貨店」のように抽出したCSVなら、ここでその区分を選んでください。
                      既に付いている他の区分はそのまま残ります。選ばずに取り込むと顧客情報だけ更新されます。
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {SEGMENT_KBNS.map((kbn) => (
                      <div key={kbn} className="space-y-1">
                        <Label className="text-xs">区分{kbn}</Label>
                        {colSelect(segMapping[kbn] ?? NONE, (v) => setSegMapping((prev) => ({ ...prev, [kbn]: v })))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {event && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateDmCount}
                    onChange={(e) => setUpdateDmCount(e.target.checked)}
                    className="h-4 w-4"
                  />
                  この催事のDM枚数を名簿の人数（{rows.length.toLocaleString()}件）で更新する
                </label>
              )}

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

          {recentLogs.length > 0 && (
            <div className="space-y-1 pt-2 border-t">
              <div className="text-xs font-semibold text-muted-foreground">最近の取込履歴</div>
              <ul className="space-y-0.5">
                {recentLogs.map((l) => (
                  <li key={l.id} className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    <span className="font-mono">{l.created_at.slice(0, 16).replace("T", " ")}</span>
                    <span className="truncate max-w-[180px]" title={l.file_name}>{l.file_name}</span>
                    <span className="text-foreground">{l.segment_label || "—"}</span>
                    <span>{l.imported_count.toLocaleString()}件</span>
                    {l.imported_by && <span>({l.imported_by})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
