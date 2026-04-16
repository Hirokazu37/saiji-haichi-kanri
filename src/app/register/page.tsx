"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>読み込み中...</p></div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [form, setForm] = useState({ username: "", display_name: "", password: "", password_confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center">
            <p className="text-destructive font-medium">無効な招待リンクです</p>
            <p className="text-sm text-muted-foreground mt-2">管理者から正しいリンクを受け取ってください</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-sm">
          <CardContent className="py-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
            <p className="font-medium text-lg">登録が完了しました</p>
            <p className="text-sm text-muted-foreground">設定したユーザー名とパスワードでログインしてください</p>
            <Button onClick={() => router.push("/login")} className="w-full">
              ログインへ
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.username || !form.display_name || !form.password) {
      setError("すべての項目を入力してください");
      return;
    }
    if (form.password !== form.password_confirm) {
      setError("パスワードが一致しません");
      return;
    }
    if (form.password.length < 6) {
      setError("パスワードは6文字以上で設定してください");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        username: form.username,
        display_name: form.display_name,
        password: form.password,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "登録に失敗しました");
      setLoading(false);
      return;
    }

    setLoading(false);
    setDone(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <UserPlus className="h-8 w-8 text-green-700" />
          </div>
          <CardTitle className="text-2xl">催事手配管理</CardTitle>
          <p className="text-sm text-muted-foreground">
            アカウントを作成してください
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">ユーザー名（ログインID）</Label>
              <Input
                id="username"
                type="text"
                placeholder="hirokazu"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">半角英数字・ハイフン・アンダースコアのみ</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">表示名</Label>
              <Input
                id="display_name"
                type="text"
                placeholder="安岡 弘和"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password_confirm">パスワード（確認）</Label>
              <Input
                id="password_confirm"
                type="password"
                value={form.password_confirm}
                onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={loading}>
              {loading ? "登録中..." : "アカウントを作成"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
