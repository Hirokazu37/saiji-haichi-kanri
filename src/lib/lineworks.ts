// LINE WORKS Bot API 2.0 連携（サーバー専用）。
// 認証: Service Account の JWT で access token を取得し、Bot からメッセージ送信する。
// 必要な環境変数:
//   LINEWORKS_CLIENT_ID / LINEWORKS_CLIENT_SECRET / LINEWORKS_SERVICE_ACCOUNT
//   LINEWORKS_PRIVATE_KEY(PEM全文) / LINEWORKS_BOT_ID
//   送信先: LINEWORKS_CHANNEL_ID（グループ）または LINEWORKS_USER_ID（個人メール）
import crypto from "crypto";

const AUTH_URL = "https://auth.worksmobile.com/oauth2/v2.0/token";
const API_BASE = "https://www.worksapis.com/v1.0";

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

// 余分な空白・改行・重複貼り付けに強くする（1行目・前後空白除去）
const firstLine = (v: string | undefined) => (v || "").trim().split(/[\r\n\s]+/)[0] || "";

function buildJwt(): string {
  const clientId = firstLine(process.env.LINEWORKS_CLIENT_ID);
  const serviceAccount = firstLine(process.env.LINEWORKS_SERVICE_ACCOUNT);
  // Vercelの複数行値はそのまま改行が入るが、万一 \n でエスケープされていた場合は戻す
  const key = (process.env.LINEWORKS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: clientId, sub: serviceAccount, iat: now, exp: now + 3600 }));
  const data = `${header}.${payload}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(data), key).toString("base64url");
  return `${data}.${sig}`;
}

export async function getAccessToken(): Promise<string> {
  const body = new URLSearchParams({
    assertion: buildJwt(),
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    client_id: firstLine(process.env.LINEWORKS_CLIENT_ID),
    client_secret: firstLine(process.env.LINEWORKS_CLIENT_SECRET),
    scope: "bot",
  });
  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(`アクセストークン取得に失敗 (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token as string;
}

export type Target = { channelId?: string; userId?: string };

export async function sendText(target: Target, text: string): Promise<void> {
  const token = await getAccessToken();
  const botId = process.env.LINEWORKS_BOT_ID || "";
  const url = target.channelId
    ? `${API_BASE}/bots/${botId}/channels/${encodeURIComponent(target.channelId)}/messages`
    : `${API_BASE}/bots/${botId}/users/${encodeURIComponent(target.userId || "")}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content: { type: "text", text } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`メッセージ送信に失敗 (${res.status}): ${t}`);
  }
}

/** Bot参加のトークルームを新規作成し、channelId を返す（グループ通知先の取得補助）。 */
export async function createChannel(title: string, memberEmails: string[]): Promise<string> {
  const token = await getAccessToken();
  const botId = process.env.LINEWORKS_BOT_ID || "";
  const res = await fetch(`${API_BASE}/bots/${botId}/channels`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, members: memberEmails.map((userId) => ({ userId })) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.channelId) {
    throw new Error(`トークルーム作成に失敗 (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.channelId as string;
}

/** 環境変数から通知先を解決（channelId 優先、無ければ userId）。 */
export function currentTarget(): Target | null {
  if (process.env.LINEWORKS_CHANNEL_ID) return { channelId: process.env.LINEWORKS_CHANNEL_ID };
  if (process.env.LINEWORKS_USER_ID) return { userId: process.env.LINEWORKS_USER_ID };
  return null;
}
