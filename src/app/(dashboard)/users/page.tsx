"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Pencil, Trash2, UserCog } from "lucide-react";

type UserProfile = {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
};

const emptyForm = { username: "", display_name: "", password: "", password_confirm: "" };

export default function UsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
    // 現在のユーザーIDを取得
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, [fetchUsers, supabase.auth]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (user: UserProfile) => {
    setEditingId(user.id);
    setForm({ username: user.username, display_name: user.display_name, password: "", password_confirm: "" });
    setError("");
    setDialogOpen(true);
  };

  const openDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    setError("");

    if (!editingId) {
      // 新規作成時のバリデーション
      if (!form.username || !form.display_name || !form.password) {
        setError("すべての項目を入力してください");
        return;
      }
      if (form.password !== form.password_confirm) {
        setError("パスワードが一致しません");
        return;
      }
    } else {
      // 編集時：パスワードが入力されている場合のみ確認
      if (form.password && form.password !== form.password_confirm) {
        setError("パスワードが一致しません");
        return;
      }
    }

    setSaving(true);

    if (editingId) {
      // 更新
      const body: Record<string, string> = { display_name: form.display_name };
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
    } else {
      // 作成
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          display_name: form.display_name,
          password: form.password,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "作成に失敗しました");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchUsers();
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
    fetchUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserCog className="h-6 w-6" />
          <h1 className="text-2xl font-bold">ユーザー管理</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          ユーザー追加
        </Button>
      </div>

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
                      <span className="ml-2 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        自分
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {new Date(user.created_at).toLocaleDateString("ja-JP")}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openDelete(user.id)}
                        disabled={user.id === currentUserId}
                      >
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

      {/* 作成/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "ユーザー編集" : "ユーザー追加"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="username">ユーザー名（ログインID）</Label>
              <Input
                id="username"
                placeholder="hirokazu"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                disabled={!!editingId}
                className={editingId ? "bg-muted" : ""}
              />
              {!editingId && (
                <p className="text-xs text-muted-foreground">半角英数字・ハイフン・アンダースコアのみ</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">表示名</Label>
              <Input
                id="display_name"
                placeholder="安岡 宏和"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                パスワード{editingId && "（変更する場合のみ入力）"}
              </Label>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">キャンセル</Button>
            </DialogClose>
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
