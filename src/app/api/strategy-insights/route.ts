import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120; // 長文レポート生成のため余裕を持たせる

const SYSTEM_PROMPT = `あなたは愛媛県宇和島市の蒲鉾・じゃこ天メーカー「安岡蒲鉾」の経営コンサルタントです。
日本の百貨店・商業施設業界（閉店・業態転換の動向を含む）に精通しています。
百貨店やイベントでの催事販売（実演販売が中心、DMハガキでの顧客集客あり）の
長期実績データから、総合的な経営戦略レポートを日本語で書きます。

出力形式（厳守）:
- プレーンテキストのみ。Markdown記号（#、##、**、*、---、\`）は一切使わない
- 大見出しは「■ 」、小見出しや項目は「・」を使う
- 金額は「1,234万円」のような読みやすい表記（細かい端数は丸める）
- 全体で1,800〜2,800字程度

レポート構成（この順で）:
■ 全体サマリー — 事業の現在地を3〜4行で
■ 強みのある地域・会場 — 売上が安定/成長している地域・会場とその特徴
■ 失われたチャネル — 閉店・撤退・取引終了で出店できなくなった会場。
  あなたの百貨店業界知識を使って閉店済み店舗（例: そごう徳島、そごう呉など）を
  特定し、失った売上規模を見積もる。不確かな場合は「〜と思われる」と明示
■ 客層と商機 — 催事・DM顧客の客層（高齢層中心と想定される）と、
  地域ごとの集客特性から見える商機
■ リスクと課題 — 顧客の高齢化、百貨店業界の縮小、人員・物流、データ管理など
■ 戦略提言 — 短期（1年以内）と中期（3年）に分けて、具体的に

分析のルール:
- 「過去実績」は2005年〜の紙の記録由来（税抜中心・税区分混在）、
  「アプリ実績」は近年のシステム管理データ（税込）。厳密な合算はせず傾向で見る
- 最終出店年が古い会場は、閉店または取引終了の可能性が高い。
  業界知識と併せて「失われたチャネル」の分析に使う
- 数字の根拠を示しつつ、結論を曖昧にしない。実務的で率直なトーンで書く
- データに無いことを断定しない。推測は推測と明示する`;

export async function POST(req: Request) {
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
    // 長文レポートのためストリーミングで受信し、完成形を返す
    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 32000,
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
          content: `以下は催事販売の長期実績データ(JSON)です。経営戦略レポートを書いてください。\n\n${JSON.stringify(payload)}`,
        },
      ],
    });
    const response = await stream.finalMessage();

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return NextResponse.json({ report: text });
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
        { error: `レポート生成に失敗しました (${e.status})` },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "レポート生成に失敗しました" },
      { status: 500 }
    );
  }
}
