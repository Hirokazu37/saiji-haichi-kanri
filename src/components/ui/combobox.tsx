"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Check, Search, PenLine } from "lucide-react";

export type ComboboxItem = {
  value: string;       // 保存される文字列（通常は表示名そのもの）
  label: string;       // 表示テキスト
  reading?: string;    // 検索・ソート用ふりがな
  group?: string;      // グループヘッダー文字列
  sublabel?: string;   // 補足（エリア名など）
};

type Props = {
  items: ComboboxItem[];
  value: string;                       // 選択中の値（自由入力の場合はその文字列）
  onChange: (value: string) => void;   // 値変更
  placeholder?: string;
  searchPlaceholder?: string;
  allowCustom?: boolean;               // 自由入力モードを許可
  emptyMessage?: string;
  className?: string;
  inputClassName?: string;             // 自由入力モード時のInputクラス
  disabled?: boolean;
};

export function Combobox({
  items,
  value,
  onChange,
  placeholder = "選択してください",
  searchPlaceholder = "検索...",
  allowCustom = true,
  emptyMessage = "候補がありません",
  className,
  inputClassName,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // valueがマスター候補に無い文字列 & 非空なら自動で自由入力モードに
  useEffect(() => {
    if (!value) {
      setCustomMode(false);
      return;
    }
    const hit = items.some((it) => it.value === value);
    if (!hit) setCustomMode(true);
  }, [value, items]);

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((it) => {
          const hay = `${it.label} ${it.reading ?? ""} ${it.sublabel ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : items;
    // グループでまとめる
    const groups = new Map<string, ComboboxItem[]>();
    filtered.forEach((it) => {
      const g = it.group ?? "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(it);
    });
    return Array.from(groups.entries());
  }, [items, search]);

  const selectedItem = items.find((it) => it.value === value);
  const displayLabel = selectedItem?.label ?? (customMode ? value : "");

  const handleSelect = (val: string) => {
    onChange(val);
    setCustomMode(false);
    setOpen(false);
    setSearch("");
  };

  const handleSwitchToCustom = () => {
    setCustomMode(true);
    setOpen(false);
    onChange("");
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSwitchToMaster = () => {
    setCustomMode(false);
    onChange("");
  };

  // 自由入力モード
  if (customMode) {
    return (
      <div className={cn("flex gap-1", className)}>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn("flex-1", inputClassName)}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleSwitchToMaster}
          disabled={disabled}
          title="マスターから選ぶ"
        >
          一覧
        </Button>
      </div>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-between font-normal", className)}
          />
        }
      >
        <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
          {displayLabel || placeholder}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="start" sideOffset={4} className="isolate z-50">
          <PopoverPrimitive.Popup
            className="z-50 w-[min(22rem,90vw)] rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0"
            initialFocus={searchInputRef as React.RefObject<HTMLElement | null>}
          >
            <div className="border-b p-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded border bg-transparent py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {matched.length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div>
              )}
              {matched.map(([groupName, groupItems]) => (
                <div key={groupName || "_"}>
                  {groupName && (
                    <div className="px-3 py-1 text-[11px] font-semibold text-muted-foreground bg-muted/40">
                      {groupName}
                    </div>
                  )}
                  {groupItems.map((it) => (
                    <button
                      key={it.value}
                      type="button"
                      onClick={() => handleSelect(it.value)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          value === it.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.sublabel && (
                        <span className="text-xs text-muted-foreground shrink-0">{it.sublabel}</span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {allowCustom && (
              <div className="border-t p-1">
                <button
                  type="button"
                  onClick={handleSwitchToCustom}
                  className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left"
                >
                  <PenLine className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">その他・自由入力</span>
                </button>
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
