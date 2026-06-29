import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60; // Claude API の応答待ちに余裕を持たせる

const SYSTEM_PROMPT = `あなたは蒲鉾・じゃこ天などの水産練製品を製造する「安岡蒲鉾」の販促アナリストです。
百貨店・イベントでの催事における「来場記録」（DMハガキを持参・提示して来店されたお客様の記録）を分析し、
社長への月次報告として分かりやすい解説を日本語で書きます。

出力形式（厳守）:
- プレーンテキストのみ。Markdown記号（#、##、**、*、---、\`）は一切使わない
- 見出しは「■ 」で始める。箇条書きは「・」を使う
- 全体で400〜600字程度。社長がさっと読める分量にする

データの意味（厳守）:
- 「来場者数」は DMハガキを持参・提示したお客様の数であり、催事の総来場者数ではない。
  「DMの反応（リピーターの動き）を測る指標」として論じる。総売上や総客数の話にすり替えない
- 「DM枚数」はその催事で発送したDMの枚数。「ヒット率」＝ 来場者数 ÷ DM枚数 で、
  DMがどれだけ来店に結びついたかを表す
- 月への集計は催事の開始日の月に全額計上する仕様（月またぎの按分はしない）

分析期間のルール（厳守）:
- 「本日」を基準に、対象月が当月（進行中）の場合は「途中経過」として扱い、数字を確定実績として断定しない
- 本日より後の催事は未開催。来場0は不振ではない。実績として論じない
- DM枚数や来場の入力がまだの催事があれば、その月の数字は実際より低く見えていることを補足する

分析のルール:
- 数字の羅列ではなく「DMの反応はどうだったか」「どの催事のヒット率が高い/低いか」「次にどう活かすか」を中心に書く
- 前年同月と比べて来場者数・ヒット率がどう動いたかに注目する。前年データが無い場合はその旨を述べる
- ヒット率が特に高い催事（DMが効いた店）、低い催事（リスト見直しの余地）を具体名で挙げる
- データに無いことは推測と明示する。煽らず、実務的で前向きなトーンで書く`;

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
          content: `以下は催事の来場記録（DM持参者）の月次集計データ(JSON)です。社長への月次報告として解説してください。\n\n${JSON.stringify(payload)}`,
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
