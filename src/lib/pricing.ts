// Otomatik fiyat kuralı hesabı — saf fonksiyon.
export type PriceRule = { percent: number; fixed: number; round: string };

export const ROUND_OPTIONS = [
  { value: "none", label: "Yuvarlama yok" },
  { value: "1", label: "Tam sayıya (ör. 120)" },
  { value: "0.90", label: ",90 ile bitsin (ör. 119,90)" },
  { value: "0.99", label: ",99 ile bitsin (ör. 119,99)" },
];

export function applyRule(price: number, rule: PriceRule): number {
  let v = price * (1 + rule.percent / 100) + rule.fixed;
  if (rule.round === "1") v = Math.round(v);
  else if (rule.round === "0.90" || rule.round === "0.99") {
    const end = Number(rule.round);
    v = Math.round(v - end) + end;
  }
  return Math.max(0, Math.round(v * 100) / 100);
}

/** ikas görsel adresi (CDN). */
export const imageUrl = (merchantId: string | null | undefined, imageId: string | null | undefined, size = 180) =>
  merchantId && imageId ? `https://cdn.myikas.com/images/${merchantId}/${imageId}/image_${size}.webp` : null;
