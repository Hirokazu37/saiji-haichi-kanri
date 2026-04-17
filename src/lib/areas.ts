export const areaMap: Record<string, string[]> = {
  "北海道": ["北海道"],
  "東北": ["青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県"],
  "関東": ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"],
  "北陸": ["新潟県", "富山県", "石川県", "福井県"],
  "中部": ["山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県"],
  "関西": ["滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県"],
  "中国": ["鳥取県", "島根県", "岡山県", "広島県", "山口県"],
  "四国": ["徳島県", "香川県", "愛媛県", "高知県"],
  "九州": ["福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県"],
  "沖縄": ["沖縄県"],
};

export const areaNames = Object.keys(areaMap);

export const allPrefectures = Object.values(areaMap).flat();

/** 都道府県リストがエリアに含まれるか判定 */
export function matchesArea(prefectures: string[], areaName: string): boolean {
  const areaPrefectures = areaMap[areaName] || [];
  return areaPrefectures.some((p) => prefectures.includes(p));
}

/** 都道府県からエリア名を取得 */
export function getAreaForPrefecture(pref: string): string | null {
  for (const [area, prefs] of Object.entries(areaMap)) {
    if (prefs.includes(pref)) return area;
  }
  return null;
}

/** 地方（region）ごとのデフォルト色 */
export const regionColors: Record<string, string> = {
  "北海道": "#EF4444", "東北": "#8B5CF6", "関東": "#F97316", "北陸": "#06B6D4",
  "中部": "#10B981", "関西": "#F59E0B", "中国": "#EC4899", "四国": "#3B82F6",
  "九州": "#14B8A6", "沖縄": "#6366F1",
};

/** 都道府県から地方色を取得（フォールバックあり） */
export function getRegionColor(pref: string | null | undefined): string {
  if (!pref) return "#CBD5E1";
  const region = getAreaForPrefecture(pref);
  return (region && regionColors[region]) || "#CBD5E1";
}
