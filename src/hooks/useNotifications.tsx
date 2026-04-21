"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePermission } from "@/hooks/usePermission";
import { useCurrentUser } from "@/hooks/useCurrentUser";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  related_event_id: string | null;
  created_at: string;
  is_read: boolean;
};

export type UseNotificationsReturn = {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const empty: UseNotificationsReturn = {
  items: [],
  unreadCount: 0,
  loading: true,
  refresh: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
};

// 直近30日 / 最大50件 をベルに表示する
const LIMIT_DAYS = 30;
const LIMIT_COUNT = 50;

export function useNotifications(): UseNotificationsReturn {
  const { role, loading: permLoading } = usePermission();
  const { user } = useCurrentUser();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const since = new Date();
    since.setDate(since.getDate() - LIMIT_DAYS);
    const sinceStr = since.toISOString();

    const [notifRes, readRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, type, title, body, link_url, related_event_id, created_at")
        .gte("created_at", sinceStr)
        .order("created_at", { ascending: false })
        .limit(LIMIT_COUNT),
      supabase
        .from("notification_reads")
        .select("notification_id")
        .eq("user_id", user.id),
    ]);

    const reads = new Set<string>(((readRes.data || []) as { notification_id: string }[]).map((r) => r.notification_id));
    const list: NotificationItem[] = ((notifRes.data || []) as Omit<NotificationItem, "is_read">[]).map((n) => ({
      ...n,
      is_read: reads.has(n.id),
    }));
    setItems(list);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (permLoading) return;
    if (role !== "admin" || !user) {
      setItems([]);
      setLoading(false);
      return;
    }
    fetchAll();
  }, [permLoading, role, user, fetchAll]);

  const markRead = useCallback(async (notificationId: string) => {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("notification_reads").upsert({ notification_id: notificationId, user_id: user.id }, { onConflict: "notification_id,user_id" });
    setItems((prev) => prev.map((n) => n.id === notificationId ? { ...n, is_read: true } : n));
  }, [user]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const unread = items.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    await supabase.from("notification_reads").upsert(
      unread.map((n) => ({ notification_id: n.id, user_id: user.id })),
      { onConflict: "notification_id,user_id" },
    );
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user, items]);

  if (permLoading || (role === "admin" && loading)) {
    return { ...empty, loading: true, refresh: fetchAll, markRead, markAllRead };
  }
  if (role !== "admin") {
    return { ...empty, loading: false };
  }

  return {
    items,
    unreadCount: items.filter((n) => !n.is_read).length,
    loading,
    refresh: fetchAll,
    markRead,
    markAllRead,
  };
}
