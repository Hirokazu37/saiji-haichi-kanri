"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { format, differenceInDays, parse, isBefore } from "date-fns";
import { ja } from "date-fns/locale";
import type { DateRange } from "react-day-picker";

type Props = {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  /** 推奨: start/endを同時に更新する単一コールバック（Reactバッチ問題を回避） */
  onChange?: (start: string, end: string) => void;
  /** 互換: 旧API（個別コールバック）。onChangeが無い場合に使用 */
  onChangeStart?: (date: string) => void;
  onChangeEnd?: (date: string) => void;
};

export function DateRangePicker({ startDate, endDate, onChange, onChangeStart, onChangeEnd }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(undefined);
  const [hovered, setHovered] = useState<Date | undefined>(undefined);

  const from = startDate ? parse(startDate, "yyyy-MM-dd", new Date()) : undefined;
  const to = endDate ? parse(endDate, "yyyy-MM-dd", new Date()) : undefined;

  // 編集中はdraft、未編集時は確定値を表示
  const selected: DateRange | undefined = draft ?? (from ? { from, to } : undefined);

  const committedDays = from && to ? differenceInDays(to, from) + 1 : null;

  // プレビュー用の計算（draft.fromはあるがtoが未選択、かつhoveredがある場合）
  const isPicking = !!draft?.from && !draft?.to;
  const previewFrom = isPicking ? draft!.from : undefined;
  const previewTo =
    isPicking && hovered && previewFrom && !isBefore(hovered, previewFrom)
      ? hovered
      : undefined;
  const previewDays =
    previewFrom && previewTo ? differenceInDays(previewTo, previewFrom) + 1 : null;

  const displayFrom = draft?.from ?? from;
  const displayTo = draft?.to ?? (draft?.from ? undefined : to);

  const handleSelect = (range: DateRange | undefined) => {
    setDraft(range);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      // 開く時: 現在の確定値をdraftに設定
      setDraft(from ? { from, to } : undefined);
      setHovered(undefined);
    } else {
      // 閉じる時: draftは破棄
      setDraft(undefined);
      setHovered(undefined);
    }
    setOpen(nextOpen);
  };

  const emit = (start: string, end: string) => {
    if (onChange) {
      onChange(start, end);
    } else {
      onChangeStart?.(start);
      onChangeEnd?.(end);
    }
  };

  const handleConfirm = () => {
    if (draft?.from) {
      const start = format(draft.from, "yyyy-MM-dd");
      const end = draft.to ? format(draft.to, "yyyy-MM-dd") : start;
      emit(start, end);
    } else {
      emit("", "");
    }
    setOpen(false);
    setDraft(undefined);
    setHovered(undefined);
  };

  const handleClear = () => {
    setDraft(undefined);
    setHovered(undefined);
  };

  const label = from
    ? to
      ? `${format(from, "M/d(E)", { locale: ja })} 〜 ${format(to, "M/d(E)", { locale: ja })}（${committedDays}日間）`
      : `${format(from, "M/d(E)", { locale: ja })} 〜 終了日を選択`
    : "日程を選択";

  // 下部インフォ表示
  const renderInfo = () => {
    // プレビュー中（開始日のみ選択、終了日候補をホバー中）
    if (previewFrom && previewTo) {
      return (
        <div className="border-t px-4 py-3 text-center bg-primary/5">
          <p className="text-sm font-medium">
            {format(previewFrom, "M月d日(E)", { locale: ja })}
            <span className="mx-2 text-muted-foreground">〜</span>
            {format(previewTo, "M月d日(E)", { locale: ja })}
          </p>
          <p className="text-xs text-primary font-semibold mt-0.5">
            {previewDays}日間（プレビュー）
          </p>
        </div>
      );
    }
    // 開始日のみ選択（ホバーなし）
    if (previewFrom && !previewTo) {
      return (
        <div className="border-t px-4 py-3 text-center">
          <p className="text-sm font-medium">
            {format(previewFrom, "M月d日(E)", { locale: ja })}
            <span className="mx-2 text-muted-foreground">〜</span>
            <span className="text-muted-foreground">終了日を選択してください</span>
          </p>
        </div>
      );
    }
    // 範囲確定済み（draft or 既存値）
    const showFrom = displayFrom;
    const showTo = displayTo;
    if (showFrom && showTo) {
      const d = differenceInDays(showTo, showFrom) + 1;
      return (
        <div className="border-t px-4 py-3 text-center">
          <p className="text-sm font-medium">
            {format(showFrom, "yyyy年M月d日(E)", { locale: ja })}
            <span className="mx-2 text-muted-foreground">〜</span>
            {format(showTo, "yyyy年M月d日(E)", { locale: ja })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{d}日間</p>
        </div>
      );
    }
    return (
      <div className="border-t px-4 py-3 text-center text-sm text-muted-foreground">
        開始日を選択してください
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger render={<Button variant="outline" className="w-full justify-start text-left font-normal h-10" />}>
        <CalendarDays className="h-4 w-4 mr-2 shrink-0" />
        <span className={from ? "" : "text-muted-foreground"}>{label}</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          onDayMouseEnter={(day) => setHovered(day)}
          onDayMouseLeave={() => setHovered(undefined)}
          numberOfMonths={2}
          locale={ja}
          defaultMonth={displayFrom || new Date()}
        />
        {renderInfo()}
        <div className="border-t px-3 py-2 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleClear} disabled={!draft?.from}>
            クリア
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              キャンセル
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!draft?.from}>
              確定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
