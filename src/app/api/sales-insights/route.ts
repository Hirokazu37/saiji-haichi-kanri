import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60; // Claude API の応答待ちに余裕を持たせる

const SYSTEM_PROMPT = `あなたは蒲鉾・じゃこ天などの水産練製品を製造する「安岡蒲鉾」の経営アナリストです。
百貨店やイベントでの催事販売の売上データを分析し、経営者向けに分かりやすい解説を日本語で書きます。

ルール:
- 数字の羅列ではなく「何が起きているか」「なぜか」「次にどうすべきか」の気づきを中心に書く
- 前年同月比で大きく動いた月、売上上位の催事、好調/不調のパターンに注目する
- 月次売上は催事の開始日の月に全額計上される仕様（月またぎの按分はしない）
- 【重要】対象年が進行中の場合（「本日」の日付で判断）、対象年の数字は途中経過。
  前年の通年実績との単純な差額を「減少」と断定してはいけない。
  会場別の増減は「前年同時期売上」と比較して論じ、通年との差はまだ開催されていない
  催事の分である可能性に触れる。本日以降の月の売上が0なのは未開催のため（不振ではない）
- 「過去実績_年別_参考値」は2005年〜の紙の記録に由来する参考データ（税抜中心・税区分混在）。
  長期トレンド（この会場は昔から強い/縮小傾向など）の文脈づけにのみ使い、
  直近の数字と厳密に比較しない
- 金額は「1,234万円」のような読みやすい表記にする（千円単位の細かい数字は丸める）
- 見出しと箇条書きを使い、全体で400〜600字程度にまとめる
- データに無いことは推測と明示する。煽らず、実務的なトーンで書く`;

export async function POST(req: Request) {
  // 認証チェック (ログインユーザーのみ)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未認証です" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。管理者に連絡してください。" },
      { status: 500 }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }

  const anthropic = new Anthropic();

  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `以下は催事販売の売上集計データ(JSON)です。経営者向けに解説してください。\n\n${JSON.stringify(payload)}`,
        },
      ],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return NextResponse.json({ insight: text });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "APIキーが無効です。管理者に連絡してください。" },
        { status: 500 }
      );
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "アクセスが集中しています。少し待ってからもう一度お試しください。" },
        { status: 429 }
      );
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `AI解説の生成に失敗しました (${e.status})` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "AI解説の生成に失敗しました" },
      { status: 500 }
    );
  }
}
