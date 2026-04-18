"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const email = `${username}@yasuoka.app`;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("ユーザー名またはパスワードが正しくありません");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      {/* 左: ブランドビジュアル (PCのみ) */}
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

      {/* 右: ログインフォーム */}
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* モバイル用ロゴ */}
          <div className="md:hidden flex flex-col items-center gap-3 text-center">
            <img
              src="/brand/logo-square.png"
              alt="安岡蒲鉾"
              className="h-16 w-16 object-contain"
            />
            <h1 className="text-xl font-bold">催事手配管理</h1>
          </div>

          <div className="space-y-1 hidden md:block">
            <h2 className="text-2xl font-bold">ログイン</h2>
            <p className="text-sm text-muted-foreground">
              ユーザー名とパスワードを入力してください
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">ユーザー名</Label>
              <Input
                id="username"
                type="text"
                placeholder="hirokazu"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "ログイン中..." : "ログイン"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            アカウントをお持ちでない場合は管理者に招待をご依頼ください
          </p>
        </div>
      </main>
    </div>
  );
}
