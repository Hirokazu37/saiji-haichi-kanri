"use client";

import { useEffect, useMemo, useState } from "react";
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
import { jstDateTimeMinute } from "@/lib/jst";

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
  // 個人情報最小化の方針（2026-06 ユーザー確定・2026-09 再確認）:
  // 標準で取り込むのは 顧客番号・氏名・カナ のみ。
  // 住所・電話・郵便番号は 自動割り当てしない。
  // → 印刷は CSVから直接読込む (sessionStorage 一時保持) 前提。
  //   DBに永続保存すると個人情報漏洩リスクが増えるため。
  const patterns: [BaseFieldKey, RegExp][] = [
    ["customer_no", /得意先コード|得意先CD|顧客番号|顧客コード|顧客No|会員番号|^コード$/i],
    ["kana", /カナ|かな|フリガナ|ふりがな/],
    ["name", /氏名|名前|得意先名|顧客名/],
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
  // 催事モード: この催事に既に登録されている名簿人数 (追加取込であることを明示するため表示)
  const [currentRecipientCount, setCurrentRecipientCount] = useState<number | null>(null);
  // 催事モード: この催事にひも付いた区分 (event_dm_segments) と、それぞれの現在人数。
  // 区分別のドロップ枠を出すために使う。
  type EventSegInfo = { kbn_no: number; code: number; segment_name: string; count: number };
  const [eventSegs, setEventSegs] = useState<EventSegInfo[]>([]);
  const [dropDraggingKey, setDropDraggingKey] = useState<string | null>(null); // 各枠のホバー表示用
  useEffect(() => {
    if (!open || !event) { setCurrentRecipientCount(null); setEventSegs([]); return; }
    // 1) 名簿の総人数
    supabase.from("event_dm_recipients")
      .select("*", { count: "exact", head: true })
      .eq("event_id", event.id)
      .then(({ count }) => setCurrentRecipientCount(count ?? 0));
    // 2) この催事に紐付いた区分 + 各区分の現在人数
    (async () => {
      const { data: links } = await supabase
        .from("event_dm_segments")
        .select("kbn_no, code")
        .eq("event_id", event.id);
      const linkList = (links as { kbn_no: number; code: number }[]) || [];
      if (linkList.length === 0) { setEventSegs([]); return; }
      // 名簿の customer_id と 区分紐付けを取り、区分別に人数集計
      const { data: recData } = await supabase
        .from("event_dm_recipients")
        .select("customer_id")
        .eq("event_id", event.id);
      const recIds = ((recData as { customer_id: string }[]) || []).map((r) => r.customer_id);
      const segCounts = new Map<string, number>();
      if (recIds.length > 0) {
        // customer_segments を chunk 取得
        for (let i = 0; i < recIds.length; i += 300) {
          const chunk = recIds.slice(i, i + 300);
          const { data: cs } = await supabase
            .from("customer_segments")
            .select("customer_id, kbn_no, code")
            .in("customer_id", chunk);
          for (const r of (cs as { customer_id: string; kbn_no: number; code: number }[]) || []) {
            const k = `${r.kbn_no}-${r.code}`;
            segCounts.set(k, (segCounts.get(k) || 0) + 1);
          }
        }
      }
      const infos: EventSegInfo[] = linkList.map((l) => {
        const seg = segments.find((s) => s.kbn_no === l.kbn_no && s.code === l.code);
        return {
          kbn_no: l.kbn_no,
          code: l.code,
          segment_name: seg?.segment_name || `区分${l.kbn_no}-${l.code}`,
          count: segCounts.get(`${l.kbn_no}-${l.code}`) || 0,
        };
      });
      setEventSegs(infos);
    })();
  }, [open, event, supabase, segments]);
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
  // 複数CSV取込用のキュー (先頭が「現在処理中」、残りは順次自動読込)
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  // 催事モード: 常に「区分限定置換」で動作。
  // 区分マスタ選択時: その区分の既存名簿を削除 → 今回CSVで再登録 (常に最新化)
  // columns モード (CSVの列で区分判定): 追加動作のみ (複数区分を1CSVでカバーするケース)
  // 別途フラグは持たず、fixedSegMaster の有無で挙動が決まる。
  // 全件マスタ照合: このCSVに無い顧客を「削除候補」にする（産直くんの全得意先CSVのときだけON）
  const [markMissingAsRemoved, setMarkMissingAsRemoved] = useState(false);
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
    setMarkMissingAsRemoved(false);
    setFileQueue([]);
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

  /** 複数CSVをまとめてドロップ/選択したときの処理。
   *  先頭のファイルを 通常の handleFile で読み込み、残りをキューに入れる。
   *  各ファイルの取込が完了したら 次のキューが自動で読み込まれる (useEffect で連鎖)。 */
  const handleMultiFiles = (files: File[]) => {
    const valid = files.filter((f) => /\.(csv|txt)$/i.test(f.name));
    if (valid.length === 0) {
      setError("CSVファイル（.csv / .txt）をドロップしてください");
      return;
    }
    const invalidCount = files.length - valid.length;
    if (invalidCount > 0) {
      setError(`${invalidCount}件のファイルは CSV/TXT ではないためスキップしました`);
    }
    // 最初のファイルを 通常フローで読み込み、残りは queue に
    handleFile(valid[0]);
    setFileQueue(valid.slice(1));
  };

  /** 区分別ドロップ枠で受けたファイルの処理。区分を事前確定させてから読み込む。
   *  複数ファイルを 同一枠にドロップしても 全て同じ区分として扱う。 */
  const handleFileWithSeg = (files: File[], seg: EventSegInfo) => {
    const valid = files.filter((f) => /\.(csv|txt)$/i.test(f.name));
    if (valid.length === 0) {
      setError("CSVファイル（.csv / .txt）をドロップしてください");
      return;
    }
    // 区分を fixedSeg にプリセット
    setSegMode("fixed");
    setFixedSeg(`${seg.kbn_no}-${seg.code}`);
    setSuggestNote(`区分「${seg.segment_name} (${seg.kbn_no}-${seg.code})」の枠で受け取り済`);
    // 先頭ファイルを読み、残りは queue へ (連続取込)
    handleFile(valid[0]);
    setFileQueue(valid.slice(1));
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

  // ファイル内の「同じ顧客番号の重複行」を数える（取込時に自動で1件にまとめる）
  const dupCount = useMemo(() => {
    const idx = mapping.customer_no;
    if (idx === NONE || rows.length === 0) return 0;
    const seen = new Set<string>();
    let dups = 0;
    for (const row of rows) {
      const v = (row[Number(idx)] ?? "").trim();
      if (!v) continue;
      if (seen.has(v)) dups++;
      else seen.add(v);
    }
    return dups;
  }, [rows, mapping.customer_no]);

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
    // 催事モード + 区分マスタ選択時: 常に「区分限定置換」動作 (最新CSVで置換)
    // 他区分の名簿は保護される
    if (event && fixedSegMaster) {
      const incoming = rows.length;
      // 既存 何人がこの区分に居るか (削除見込み) を UI表示ロジックの流用で概算取得
      const ok = window.confirm(
        `📮 「${fixedSegMaster.segment_name} (${fixedSegMaster.kbn_no}-${fixedSegMaster.code})」 の名簿を最新CSVで置き換えます。\n\n` +
        `動作:\n` +
        `  ・この区分に属する 既存の名簿を いったん削除\n` +
        `  ・今回のCSV (${incoming.toLocaleString()}行) を 「${fixedSegMaster.segment_name}」 として登録\n\n` +
        `他の区分の名簿 (例: 併存する阪神百貨店の名簿など) は影響ありません。\n` +
        `DM辞退・整理された方は 産直くん側で外れているので、この置換で自動的に反映されます。\n\n` +
        `続けますか？`
      );
      if (!ok) return;
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
        // 区分マスタが指定されている場合、常に「区分限定置換」で動作する。
        // その区分に属する既存名簿だけを削除 → 今回CSVで登録し直し。
        // 他区分 (併存する 阪神百貨店 vs お試し等) は完全に保護される。
        // 産直くんで整理・DM辞退フラグを外した人は 自動的に外れる。
        if (fixedSegMaster) {
          setProgress(`${fixedSegMaster.segment_name} の既存名簿を削除中…`);
          // ① この区分に属する 全 customer_id を取得
          const targetCustomerIds: string[] = [];
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase
              .from("customer_segments")
              .select("customer_id")
              .eq("kbn_no", fixedSegMaster.kbn_no)
              .eq("code", fixedSegMaster.code)
              .range(from, from + 999);
            if (error) throw new Error(`区分限定置換の下調べ失敗: ${error.message}`);
            const part = (data as { customer_id: string }[]) || [];
            targetCustomerIds.push(...part.map((r) => r.customer_id));
            if (part.length < 1000) break;
          }
          // ② 該当顧客の event_dm_recipients を削除 (chunk で送る)
          if (targetCustomerIds.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < targetCustomerIds.length; i += CHUNK) {
              const chunkIds = targetCustomerIds.slice(i, i + CHUNK);
              const { error: delErr } = await supabase
                .from("event_dm_recipients")
                .delete()
                .eq("event_id", event.id)
                .in("customer_id", chunkIds);
              if (delErr) throw new Error(`名簿の置換前削除に失敗: ${delErr.message}`);
            }
          }
        }
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
          // 追加取込後は 名簿の合計人数 (event_dm_recipients の総数) を dm_count にする。
          // records.length (今回のCSV分だけ) だと、既存分を上書きして誤ったカウントになるため。
          const { count: totalCount } = await supabase
            .from("event_dm_recipients")
            .select("*", { count: "exact", head: true })
            .eq("event_id", event.id);
          await supabase.from("events").update({ dm_count: totalCount ?? records.length }).eq("id", event.id);
        }
      }

      // 全件マスタ照合: このCSVに無い顧客を「削除候補」に、再登場した顧客は「有効」に戻す
      let removedCount = 0;
      if (!event && markMissingAsRemoved) {
        const csvNoSet = new Set(byNo.keys());
        setProgress("産直くんの全件と照合中…");
        const all: { id: string; customer_no: string; status: string }[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error: selErr } = await supabase
            .from("customers")
            .select("id, customer_no, status")
            .order("customer_no")
            .range(from, from + 999);
          if (selErr) throw new Error(selErr.message);
          const part = (data as { id: string; customer_no: string; status: string }[]) || [];
          all.push(...part);
          if (part.length < 1000) break;
        }
        const nowIso = new Date().toISOString();
        const missingIds = all.filter((c) => !csvNoSet.has(c.customer_no) && c.status === "有効").map((c) => c.id);
        const reappearedIds = all.filter((c) => csvNoSet.has(c.customer_no) && c.status === "削除候補").map((c) => c.id);
        removedCount = missingIds.length;
        for (const part of chunk(missingIds, 300)) {
          const { error: upErr } = await supabase.from("customers").update({ status: "削除候補" }).in("id", part);
          if (upErr) throw new Error(upErr.message);
        }
        for (const part of chunk(reappearedIds, 300)) {
          await supabase.from("customers").update({ status: "有効", master_seen_at: nowIso }).in("id", part);
        }
      }

      setProgress("");
      // 催事×区分が確定している取込なら、DMハガキ一覧の区分チェックも自動で付ける
      // (「取込はしたが区分の記録が付いていない」の防止)
      if (event?.id && fixedSegMaster) {
        await supabase.from("event_dm_segments").upsert(
          {
            event_id: event.id,
            kbn_no: fixedSegMaster.kbn_no,
            code: fixedSegMaster.code,
          },
          { onConflict: "event_id,kbn_no,code", ignoreDuplicates: true }
        );
      }
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
      const dupNote = rows.length - skipped - records.length;
      const notes = [
        dupNote > 0 ? `重複 ${dupNote} 行を1件にまとめ` : "",
        skipped > 0 ? `番号または氏名が空の ${skipped} 行はスキップ` : "",
        removedCount > 0 ? `このCSVに無い ${removedCount} 件を「削除候補」に変更` : "",
      ].filter(Boolean).join("、");
      setResult(`${records.length.toLocaleString()}件を${segNote}取り込みました${notes ? `（${notes}）` : ""}`);
      onImported();
      // 履歴表示を更新
      const { data: logs } = await supabase
        .from("customer_import_logs")
        .select("id, file_name, imported_count, segment_label, imported_by, created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      setRecentLogs((logs as ImportLog[]) || []);
      // 取込待ちキューに次のCSVがあれば 自動で読み込む (ユーザー体験の連続化)
      if (fileQueue.length > 0) {
        const [next, ...rest] = fileQueue;
        setFileQueue(rest);
        // 現在の状態 (mapping, fixedSeg 等) を一旦リセットしてから次を読む
        setFileName(""); setFileMtime(null); setHeaders([]); setRows([]);
        setMapping({ ...EMPTY_MAPPING });
        setSegMapping({});
        setSegMode("fixed");
        setFixedSeg("");
        setSuggestNote("");
        // 少し待ってから次を読む (setResult のメッセージが見える時間を確保)
        setTimeout(() => { handleFile(next); }, 300);
      }
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
      <DialogContent className="sm:w-[92vw] sm:max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? `DM名簿CSVの取込 — ${event.label}` : "マスタ一括取込（補助）"}</DialogTitle>
        </DialogHeader>

        {/* min-w-0: グリッド子要素が中身（横長のプレビュー表）に引っ張られて
            ダイアログ全体が横に膨らむのを防ぐ。表は枠内で横スクロールさせる */}
        <div className="space-y-4 min-w-0">
          {!event && (
            <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              催事のDM名簿の取込は、ここではなく「DMハガキ」画面の各催事の「名簿」ボタンから行ってください。
              この画面は催事にひも付けない補助用（初回の一括登録／区分の付け直し／住所変更などの情報更新）です。
            </div>
          )}
          <div className="text-sm text-muted-foreground">
            {event
              ? "この催事のDMに使った名簿CSV（産直くんで区分抽出したもの）を選んでください。名簿のお客様がこの催事にひも付き、来場登録時の照合やDMヒット率に使われます。"
              : "産直くん11からエクスポートした得意先のCSVを選んでください（Shift_JIS / UTF-8 どちらでも可）。同じ顧客番号は上書き更新されるので、何度でも取り込み直せます。"}
          </div>

          {/* 催事モード: 動作モードを明示
              - 区分マスタ選択済 (segMode='fixed' + fixedSeg 選択): その区分の名簿を最新CSVで置換
              - columns モード or 区分未選択: 追加のみ (複数区分カバー用) */}
          {event && (
            <div className={`rounded-md border-2 px-4 py-3 text-sm ${
              segMode === "fixed" && fixedSeg
                ? "border-blue-300 bg-blue-50/50 text-blue-900"
                : "border-emerald-300 bg-emerald-50/50 text-emerald-900"
            }`}>
              {segMode === "fixed" && fixedSeg ? (
                <div>
                  <div className="font-bold text-base mb-1">📮 置換モード（区分限定・既定）</div>
                  <div className="text-sm space-y-1">
                    <div>
                      下で選んだ <span className="font-bold">区分の既存名簿を最新CSVで置き換え</span> ます。
                      産直くんで整理・DM辞退フラグを外した方は 自動で外れます。
                    </div>
                    <div>
                      現在この催事の名簿: <span className="font-bold text-base">{currentRecipientCount === null ? "…" : currentRecipientCount.toLocaleString()}人</span>
                      （他の区分がある場合、そちらは <span className="font-medium">影響なし</span>）
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-bold text-base mb-1">✅ 追加取込モード</div>
                  <div className="text-sm space-y-1">
                    <div>
                      現在この催事の名簿: <span className="font-bold text-base">{currentRecipientCount === null ? "…" : currentRecipientCount.toLocaleString()}人</span>
                    </div>
                    <div>
                      今回CSVを 追加 で取込みます (既存は消えません・重複は自動スキップ)。
                    </div>
                    <div className="text-emerald-700 mt-1">
                      💡 <span className="font-medium">最新版で置換したい</span> (DM辞退対応など) 場合は、下の「区分」欄で 1つ選んでください
                      → 自動的に置換モードになります。
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 区分別 ドロップ枠 (催事にひも付いた区分ごとに用意)。
              こちらにドロップすると 区分が自動確定される → 取込操作が最小。 */}
          {event && eventSegs.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-bold text-foreground">
                🎯 区分別 ドロップ枠 <span className="text-xs font-normal text-muted-foreground">(この催事に設定された区分ごと)</span>
              </div>
              <div className={`grid gap-3 ${eventSegs.length > 1 ? "sm:grid-cols-2" : ""}`}>
                {eventSegs.map((seg) => {
                  const key = `${seg.kbn_no}-${seg.code}`;
                  const active = dropDraggingKey === key;
                  return (
                    <label
                      key={key}
                      onDragOver={(e) => { e.preventDefault(); setDropDraggingKey(key); }}
                      onDragLeave={() => setDropDraggingKey(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropDraggingKey(null);
                        handleFileWithSeg(Array.from(e.dataTransfer.files || []), seg);
                      }}
                      className={`relative flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg p-5 cursor-pointer transition-all min-h-[140px] ${
                        active
                          ? "border-blue-500 bg-blue-50 scale-[1.02]"
                          : "border-blue-300 bg-blue-50/30 hover:bg-blue-50/60"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                        区{seg.kbn_no}-{seg.code}
                      </span>
                      <span className="text-base font-bold text-blue-900 text-center">
                        {seg.segment_name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        現在: <span className="font-bold text-blue-800 text-base">{seg.count.toLocaleString()}人</span>
                      </span>
                      <span className={`text-sm font-medium mt-1 ${active ? "text-blue-900" : "text-blue-700"}`}>
                        {active ? "📥 ドロップで取込" : "📁 CSVをドロップ or クリック"}
                      </span>
                      <input
                        type="file"
                        accept=".csv,.txt"
                        multiple
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={(e) => { handleFileWithSeg(Array.from(e.target.files || []), seg); e.target.value = ""; }}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground pl-1">
                💡 2つのCSVを同時にドロップしてもOK (キュー処理で 順番に取込)。ファイル名から区分推定もされます。
              </div>
            </div>
          )}

          {/* 汎用ドロップ枠 (区分別枠に該当しない or 別の区分で試したい時の補助) */}
          {event && eventSegs.length > 0 && (
            <div className="text-sm font-medium text-muted-foreground pt-2">
              その他の区分・ファイル <span className="text-xs">(区分は下で選択)</span>:
            </div>
          )}
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const files = Array.from(e.dataTransfer.files || []);
              handleMultiFiles(files);
            }}
            className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
              dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50"
            }`}
          >
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm">
              {fileName || (dragging
                ? "ここにドロップして取込（複数CSVをまとめてドロップも可）"
                : "CSVファイルを選択（ここにドラッグ＆ドロップも可・複数選択OK）")}
            </span>
            <input
              type="file"
              accept=".csv,.txt"
              multiple
              className="hidden"
              onChange={(e) => { handleMultiFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
            />
          </label>

          {/* 取込待ちキュー (2件目以降のCSV) */}
          {fileQueue.length > 0 && (
            <div className="rounded-md border-2 border-amber-300 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
              <div className="font-bold mb-1">📋 取込待ち {fileQueue.length}件</div>
              <ul className="space-y-0.5">
                {fileQueue.map((f, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span className="text-amber-700">{i + 1}.</span>
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-amber-700 text-[10px]">({(f.size / 1024).toFixed(0)} KB)</span>
                  </li>
                ))}
              </ul>
              <div className="mt-1 text-amber-700 text-[10px]">
                今のCSVを取込ボタンで登録すると、次のCSVが自動で読み込まれます。
              </div>
              <button
                type="button"
                onClick={() => setFileQueue([])}
                className="mt-1 text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                待ちキューをクリア
              </button>
            </div>
          )}

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

          {/* 上部アクションバー: 読み込んだファイルの情報 + 大きな取り込みボタン
              (スクロール不要で1クリック取込を可能に) */}
          {rows.length > 0 && (
            <div className="rounded-lg border-2 border-primary bg-primary/5 p-4 flex items-center gap-3 flex-wrap sticky top-0 z-10 shadow-sm">
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="text-sm">
                  <span className="font-bold text-base">{fileName}</span>
                  <span className="ml-2 text-muted-foreground">
                    ({(rows.length - dupCount).toLocaleString()}件
                    {dupCount > 0 && ` / 重複 ${dupCount}件は自動除外`})
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  区分: {segMode === "fixed" && fixedSeg
                    ? (() => {
                        const s = segments.find((x) => segKey(x.kbn_no, x.code) === fixedSeg);
                        return s ? (
                          <span className="font-bold text-blue-800">
                            📮 {s.segment_name} ({s.kbn_no}-{s.code}) に置換
                          </span>
                        ) : "未選択";
                      })()
                    : segMode === "columns"
                      ? <span className="text-emerald-800 font-medium">CSVの列で自動判定 (追加)</span>
                      : <span className="text-amber-800 font-medium">⚠ 下の「区分」欄で選んでください</span>
                  }
                  {fileQueue.length > 0 && (
                    <span className="ml-3">・取込後に自動で残り {fileQueue.length}件も処理</span>
                  )}
                </div>
              </div>
              <Button
                onClick={handleImport}
                disabled={importing || rows.length === 0}
                size="lg"
                className="text-base font-bold shadow-md whitespace-nowrap"
              >
                <Upload className="h-5 w-5 mr-1.5" />
                {importing ? "取込中…" : `📥 取り込む (${(rows.length - dupCount).toLocaleString()}件)`}
              </Button>
            </div>
          )}

          {headers.length > 0 && (
            <>
              <div className="space-y-2">
                <div className="text-sm font-medium">列の割り当て（自動で推測しています。違っていたら直してください）</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-amber-800">🔒 個人情報保護のため</span>、標準で取り込むのは<span className="font-semibold text-foreground">顧客番号・氏名・カナ</span>のみです。
                  住所・電話番号などは「（使わない）」のままにしてください
                  {event && <>（<span className="font-medium">宛名印刷は 産直くんのCSVから直接読込</span>する仕組みで、DBに住所を保存しません）</>}。
                </div>
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
                  <span>
                    この催事のDM枚数を <span className="font-medium">名簿の合計人数</span> で更新する
                    {currentRecipientCount !== null && (
                      <span className="text-xs text-muted-foreground ml-1">
                        （取込後の想定合計: 約 {(currentRecipientCount + (rows.length - dupCount)).toLocaleString()}人 — 既登録との重複はさらに減ります）
                      </span>
                    )}
                  </span>
                </label>
              )}

              {!event && (
                <label className="flex items-start gap-2 text-sm cursor-pointer select-none rounded-md bg-rose-50 border border-rose-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={markMissingAsRemoved}
                    onChange={(e) => setMarkMissingAsRemoved(e.target.checked)}
                    className="h-4 w-4 mt-0.5"
                  />
                  <span className="text-rose-900">
                    このCSVに<span className="font-bold">無い顧客</span>を「削除候補」にする
                    <span className="block text-xs text-rose-700">
                      ※産直くんの<span className="font-bold">全得意先CSV</span>を取り込むときだけONにしてください。区分別の名簿CSVでONにすると、他店の顧客まで削除候補になってしまいます。
                    </span>
                  </span>
                </label>
              )}

              <div className="space-y-1">
                <div className="text-sm font-medium">プレビュー（先頭3行）</div>
                <div className="overflow-x-auto border rounded-md max-w-full">
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
                <div className="text-xs text-muted-foreground">
                  データ行数: {rows.length.toLocaleString()}
                  {dupCount > 0 && (
                    <span className="text-amber-700 font-medium">
                      {" "}（うち同じ顧客番号の重複 {dupCount} 行 — 取込時に自動で1件にまとめます）
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {progress && <div className="text-sm text-primary">{progress}</div>}
          {error && <div className="text-sm text-destructive whitespace-pre-wrap">{error}</div>}
          {result && <div className="text-sm text-green-600 font-medium">{result}</div>}

          {recentLogs.length > 0 && (
            <div className="space-y-1 pt-2 border-t">
              <div className="text-sm font-bold text-foreground">最近の取込履歴 <span className="text-xs font-normal text-muted-foreground">(日本時間)</span></div>
              <ul className="space-y-1">
                {recentLogs.map((l) => (
                  <li key={l.id} className="text-sm text-foreground flex flex-wrap gap-x-3 gap-y-0.5 py-0.5">
                    <span className="font-mono text-muted-foreground">{jstDateTimeMinute(l.created_at)}</span>
                    <span className="truncate max-w-[220px] text-muted-foreground" title={l.file_name}>{l.file_name}</span>
                    <span className="font-medium">{l.segment_label || "—"}</span>
                    <span className="font-bold">{l.imported_count.toLocaleString()}件</span>
                    {l.imported_by && <span className="text-muted-foreground">({l.imported_by})</span>}
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
