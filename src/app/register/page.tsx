"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle } from "lucide-react";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>読み込み中...</p></div>}>
      <RegisterForm />
    </Suspense>
  );
}

function BrandShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <aside className="relative hidden md:flex flex-col justify-between overflow-hidden bg-primary text-primary-foreground p-10">
        <div
          className="absolute inset-0 opacity-[0.08] bg-no-repeat bg-center bg-contain"
          style={{ backgroundImage: "url('/brand/logo-circle.png')" }}
          aria-hidden
        />
        <div className="relative z-10">
          <img
            src="/brand/logo-circle.png"
            alt="安岡蒲鉾"
            className="h-20 w-20 object-contain bg-white rounded-full p-2 shadow-lg"
          />
        </div>
        <div className="relative z-10 space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">催事手配管理</h1>
          <p className="text-sm text-primary-foreground/80 leading-relaxed">
            安岡蒲鉾の催事出店に必要な手配業務を一元管理。
            <br />
            会場・社員配置・ホテル・交通・備品の流れまで、迷わず見渡せる。
          </p>
        </div>
        <div className="relative z-10 text-xs text-primary-foreground/60">
          安岡蒲鉾株式会社
        </div>
      </aside>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="md:hidden flex flex-col items-center gap-3 text-center">
            <img
              src="/brand/logo-square.png"
              alt="安岡蒲鉾"
              className="h-16 w-16 object-contain"
            />
            <h1 className="text-xl font-bold">催事手配管理</h1>
          </div>
          {children}
        </div>
      </main>
    </div>
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
      <BrandShell>
        <div className="text-center space-y-3 rounded-lg border bg-card p-8">
          <p className="text-destructive font-medium">無効な招待リンクです</p>
          <p className="text-sm text-muted-foreground">管理者から正しいリンクを受け取ってください</p>
        </div>
      </BrandShell>
    );
  }

  if (done) {
    return (
      <BrandShell>
        <div className="text-center space-y-4 rounded-lg border bg-card p-8">
          <CheckCircle className="h-12 w-12 text-primary mx-auto" />
          <p className="font-medium text-lg">登録が完了しました</p>
          <p className="text-sm text-muted-foreground">設定したユーザー名とパスワードでログインしてください</p>
          <Button onClick={() => router.push("/login")} className="w-full">
            ログインへ
          </Button>
        </div>
      </BrandShell>
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
    if (form.password.length < 8) {
      setError("パスワードは8文字以上で設定してください");
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
    <BrandShell>
      <div className="space-y-1 hidden md:block">
        <h2 className="text-2xl font-bold">アカウント作成</h2>
        <p className="text-sm text-muted-foreground">
          招待リンクからアカウントを作成します
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-5">
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
          <p className="text-xs text-muted-foreground">8文字以上</p>
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
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "登録中..." : "アカウントを作成"}
        </Button>
      </form>
    </BrandShell>
  );
}
