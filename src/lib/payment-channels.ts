// 決済チャネル (支払方法別入金) のマスタ
//
// 催事によっては 1つのイベントで 現金・PayPay・クレジット等が併用され、
// 入金先も異なる (現金は venue 経由、PayPay は自社口座に直接など)。
// event_payments.channel でチャネルを識別し、この定数で既定値を引く。

export type PaymentChannelKey = "現金" | "PayPay" | "クレジット" | "その他";

export type PaymentChannelDef = {
  key: PaymentChannelKey;
  label: string;
  /** 既定の決済手数料率 (%)。DB の event_payments.fee_rate 初期値 */
  defaultFeeRate: number;
  /** 既定で自社直接入金か (true=venueを経由しない) */
  defaultSelfReceive: boolean;
  /** UI 表示用のバッジ色クラス */
  badgeClass: string;
  /** アイコン (絵文字で簡易化) */
  icon: string;
};

export const PAYMENT_CHANNELS: PaymentChannelDef[] = [
  {
    key: "現金",
    label: "現金",
    defaultFeeRate: 0,
    defaultSelfReceive: false, // venue に集金・清算されるのが一般的
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: "💴",
  },
  {
    key: "PayPay",
    label: "PayPay",
    defaultFeeRate: 3.24, // 自社持込PayPayの手数料 (2026年時点の一般的な率)
    defaultSelfReceive: true, // 自社口座に直接入金
    badgeClass: "bg-red-100 text-red-800 border-red-300",
    icon: "📱",
  },
  {
    key: "クレジット",
    label: "クレジット",
    defaultFeeRate: 3.5,
    defaultSelfReceive: false, // 自社かvenueかは催事で異なる
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
    icon: "💳",
  },
  {
    key: "その他",
    label: "その他",
    defaultFeeRate: 0,
    defaultSelfReceive: false,
    badgeClass: "bg-gray-100 text-gray-700 border-gray-300",
    icon: "•",
  },
];

export const PAYMENT_CHANNEL_MAP: Record<PaymentChannelKey, PaymentChannelDef> =
  Object.fromEntries(PAYMENT_CHANNELS.map((c) => [c.key, c])) as Record<PaymentChannelKey, PaymentChannelDef>;
