"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { usePermission } from "@/hooks/usePermission";

function timeAgo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((now - t) / 1000);
  if (diffSec < 60) return "今";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function NotificationBell() {
  const { role, loading: permLoading } = usePermission();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  // admin以外には表示しない（ロード中も非表示）
  if (permLoading || role !== "admin") return null;

  const handleClickItem = async (id: string) => {
    await markRead(id);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-muted transition-colors"
            aria-label={`通知 ${unreadCount > 0 ? `(${unreadCount}件未読)` : ""}`}
          />
        }
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold leading-[18px] text-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">通知</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead()}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              全て既読
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">通知はありません</p>
          ) : (
            items.map((n) => {
              const content = (
                <div className={`px-3 py-2 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${!n.is_read ? "bg-blue-50/40" : ""}`}>
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-rose-500 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.is_read ? "font-semibold" : ""}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground leading-snug truncate">{n.body}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
              if (n.link_url) {
                return (
                  <Link key={n.id} href={n.link_url} onClick={() => handleClickItem(n.id)} className="block">
                    {content}
                  </Link>
                );
              }
              return (
                <div key={n.id} onClick={() => handleClickItem(n.id)} className="cursor-pointer">
                  {content}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
