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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Trash2, UserCog, Link2, Copy, Check } from "lucide-react";

type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  can_edit: boolean;
  created_at: string;
};

type InviteToken = {
  id: string;
  token: string;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

const emptyForm = { display_name: "", password: "", password_confirm: "", can_edit: false };

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
    if (usersRes.ok) setUsers(await usersRes.json());
    if (invitesRes.ok) setInvites(await invitesRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [fetchData, supabase.auth]);

  // 招待リンク生成
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

  // 編集
  const openEdit = (user: UserProfile) => {
    setEditingId(user.id);
    setEditingUsername(user.username);
    setForm({ display_name: user.display_name, password: "", password_confirm: "", can_edit: user.can_edit });
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
    const body: Record<string, unknown> = { display_name: form.display_name, can_edit: form.can_edit };
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

  // 編集権限トグル
  const handleToggleCanEdit = async (userId: string, newValue: boolean) => {
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_edit: newValue } : u)));
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ can_edit: newValue }),
    });
    if (!res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, can_edit: !newValue } : u)));
    }
  };

  // 削除
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

  // 未使用の招待リンク
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
                <TableHead className="text-center">編集権限</TableHead>
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
                  <TableCell className="text-center">
                    <Switch
                      checked={user.can_edit}
                      onCheckedChange={(v) => handleToggleCanEdit(user.id, v)}
                      className="data-[state=checked]:bg-green-700"
                    />
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
              以下のリンクを共有してください。リンクは7日間有効です。
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
            <div className="flex items-center justify-between py-2">
              <Label htmlFor="can_edit">編集権限</Label>
              <Switch
                id="can_edit"
                checked={form.can_edit}
                onCheckedChange={(v) => setForm({ ...form, can_edit: v })}
                className="data-[state=checked]:bg-green-700"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              ONにすると催事・マスターデータの追加・編集・削除ができます。OFFの場合は閲覧のみです。
            </p>
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
