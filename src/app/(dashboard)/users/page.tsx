"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, UserCog, Link2, Copy, Check } from "lucide-react";
import type { UserRole } from "@/hooks/usePermission";

type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  can_edit: boolean;
  role: UserRole;
  can_view_payments: boolean;
  created_at: string;
};

type InviteToken = {
  id: string;
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "編集可能",
  viewer: "閲覧のみ",
  limited: "製造スタッフ（日程表のみ）",
};

const ROLE_DESC: Record<UserRole, string> = {
  admin: "催事・マスターデータの追加・編集・削除が可能。マネキン評価★も閲覧可能。",
  viewer: "全画面を閲覧のみ可能（編集不可）。マネキン評価★は非表示。",
  limited: "ダッシュボード・日程表・社員スケジュールのみ閲覧可能。製造スタッフなど共有範囲を絞りたい人向け。",
};

const emptyForm: { display_name: string; password: string; password_confirm: string; role: UserRole; can_view_payments: boolean } = {
  display_name: "",
  password: "",
  password_confirm: "",
  role: "viewer",
  can_view_payments: false,
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<InviteToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [generatingInvite, setGeneratingInvite] = useState(false);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [usersRes, invitesRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/invites"),
    ]);
    if (usersRes.ok) {
      const data = (await usersRes.json()) as UserProfile[];
      // role が無い既存データは can_edit から補完
      setUsers(
        data.map((u) => ({
          ...u,
          role: (u.role ?? (u.can_edit ? "admin" : "viewer")) as UserRole,
        }))
      );
    }
    if (invitesRes.ok) setInvites(await invitesRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [fetchData, supabase.auth]);

  const handleGenerateInvite = async () => {
    setGeneratingInvite(true);
    const res = await fetch("/api/invites", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const url = `${window.location.origin}/register?token=${data.token}`;
      setInviteUrl(url);
      setCopied(false);
      setInviteDialogOpen(true);
      fetchData();
    }
    setGeneratingInvite(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openEdit = (user: UserProfile) => {
    setEditingId(user.id);
    setEditingUsername(user.username);
    setForm({
      display_name: user.display_name,
      password: "",
      password_confirm: "",
      role: user.role,
      can_view_payments: user.can_view_payments,
    });
    setError("");
    setEditDialogOpen(true);
  };

  const handleSave = async () => {
    setError("");
    if (form.password && form.password !== form.password_confirm) {
      setError("パスワードが一致しません");
      return;
    }

    setSaving(true);
    const body: Record<string, unknown> = {
      display_name: form.display_name,
      role: form.role,
      can_view_payments: form.can_view_payments,
    };
    if (form.password) body.password = form.password;

    const res = await fetch(`/api/users/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "更新に失敗しました");
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditDialogOpen(false);
    fetchData();
  };

  // 行の権限セレクト直接変更
  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    const prev = users.find((u) => u.id === userId);
    if (!prev) return;

    setUsers((list) =>
      list.map((u) => (u.id === userId ? { ...u, role: newRole, can_edit: newRole === "admin" } : u))
    );

    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      // 失敗したらロールバックしてエラー内容を出す
      setUsers((list) =>
        list.map((u) => (u.id === userId ? { ...u, role: prev.role, can_edit: prev.can_edit } : u))
      );
      let message = "権限の更新に失敗しました";
      try {
        const data = await res.json();
        if (data?.error) message += `\n\n${data.error}`;
      } catch {
        // ignore
      }
      if (/role/i.test(message) && /column|schema|does not exist/i.test(message)) {
        message += "\n\nSupabase の SQL Editor で migration 012_user_role.sql が実行されているか確認してください。";
      }
      alert(message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const res = await fetch(`/api/users/${deletingId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || "削除に失敗しました");
    }
    setDeleteDialogOpen(false);
    setDeletingId(null);
    fetchData();
  };

  const pendingInvites = invites.filter((i) => !i.used_at && new Date(i.expires_at) > new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-6 w-6" />
          <h1 className="text-2xl font-bold">ユーザー管理</h1>
        </div>
        <Button onClick={handleGenerateInvite} disabled={generatingInvite} className="bg-green-700 hover:bg-green-800">
          <Link2 className="h-4 w-4 mr-2" />
          招待リンクを生成
        </Button>
      </div>

      {/* 未使用の招待リンク */}
      {pendingInvites.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700">未使用の招待リンク（{pendingInvites.length}件）</p>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center gap-2 text-xs">
              <code className="bg-white dark:bg-gray-800 px-2 py-1 rounded border text-[10px] flex-1 truncate">
                {window.location.origin}/register?token={inv.token}
              </code>
              <span className="text-muted-foreground shrink-0">
                {new Date(inv.expires_at).toLocaleDateString("ja-JP")}まで
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] shrink-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/register?token=${inv.token}`);
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 権限レベルの説明 */}
      <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
        <p className="font-semibold text-foreground">権限レベル</p>
        {(["admin", "viewer", "limited"] as UserRole[]).map((r) => (
          <p key={r}>
            <span className="font-medium">{ROLE_LABEL[r]}</span>: <span className="text-muted-foreground">{ROLE_DESC[r]}</span>
          </p>
        ))}
      </div>

      {/* ユーザー一覧 */}
      {loading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground">ユーザーが登録されていません</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ユーザー名</TableHead>
                <TableHead>表示名</TableHead>
                <TableHead>権限</TableHead>
                <TableHead className="hidden md:table-cell">作成日</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono">{user.username}</TableCell>
                  <TableCell className="font-medium">
                    {user.display_name}
                    {user.id === currentUserId && (
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">自分</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(v) => handleChangeRole(user.id, v as UserRole)}
                    >
                      <SelectTrigger className="w-[200px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                        <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                        <SelectItem value="limited">{ROLE_LABEL.limited}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("ja-JP")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setDeletingId(user.id); setDeleteDialogOpen(true); }} disabled={user.id === currentUserId}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 招待リンク生成ダイアログ */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>招待リンクを生成しました</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              以下のリンクを共有してください。リンクは7日間有効です。新規アカウントは「閲覧のみ」で作成されます。
            </p>
            <div className="flex gap-2">
              <Input value={inviteUrl} readOnly className="text-xs font-mono" />
              <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            {copied && <p className="text-xs text-green-600">コピーしました</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ユーザー編集（{editingUsername}）</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="display_name">表示名</Label>
              <Input
                id="display_name"
                placeholder="安岡 弘和"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード（変更する場合のみ入力）</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password_confirm">パスワード（確認）</Label>
              <Input
                id="password_confirm"
                type="password"
                value={form.password_confirm}
                onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">権限</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                  <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                  <SelectItem value="limited">{ROLE_LABEL.limited}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESC[form.role]}</p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="can_view_payments" className="text-sm font-medium">経理（入金管理）閲覧</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ONで入金管理ページ・帳合先マスターにアクセス可能。
                  {form.role === "admin" && "（編集可能ロールは常にON扱い）"}
                </p>
              </div>
              <Switch
                id="can_view_payments"
                checked={form.role === "admin" ? true : form.can_view_payments}
                disabled={form.role === "admin"}
                onCheckedChange={(v) => setForm({ ...form, can_view_payments: v })}
                className="data-[state=checked]:bg-green-700"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">キャンセル</Button>} />
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ユーザーを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              このユーザーのアカウントが完全に削除されます。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
