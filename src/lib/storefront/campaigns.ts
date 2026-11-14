// Flash Ürünler ve Fiyat Altı İndirimi: her panel kampanyası ikas'ta bir indirim kampanyası (fixedDiscount) olarak tutulur.
// İndirimi ikas uygular. Şema introspection ile doğrulandı:
// CampaignInput { type RATIO|FIXED_AMOUNT, fixedDiscount { amount, filters [{ type PRODUCT|CATEGORY|VARIANT, idList }] }, dateRange, applyCampaignToProductPrice }.
import type { Store } from "@prisma/client";
import { deleteCampaigns, saveCampaign } from "../ikas";
import { type Scalar, type Settings, trTime } from "./modules";

type Camp = Record<string, Scalar>;
const ids = (v: Scalar | undefined) => String(v ?? "").split(",").filter(Boolean);

export function validateDiscount(c: Camp): string | null {
  const name = String(c.name || "").trim();
  if (!name) return "Kampanya adı boş olamaz.";
  const a = Number(c.amount);
  if (!(a > 0)) return `${name}: indirim değeri girin.`;
  if (c.discountType === "RATIO" && a > 100) return `${name}: yüzde indirim 100'ü geçemez.`;
  if (c.scope === "products" && !ids(c.productIds).length) return `${name}: en az bir ürün seçin.`;
  if (c.scope === "categories" && !ids(c.categoryIds).length) return `${name}: en az bir kategori seçin.`;
  if (c.scope === "variants" && !ids(c.variantIds).length) return `${name}: en az bir varyant seçin.`;
  const s = trTime(c.startAt), e = trTime(c.endAt);
  if (c.requireEnd === true && !e) return `${name}: bitiş tarihi zorunlu (geri sayım bu tarihe göre çalışır).`;
  if (s && e && e <= s) return `${name}: bitiş başlangıçtan sonra olmalı.`;
  return null;
}

export function toDiscountInput(c: Camp, applyToProductPrice: boolean) {
  const filters =
    c.scope === "products" ? [{ type: "PRODUCT", idList: ids(c.productIds) }]
    : c.scope === "categories" ? [{ type: "CATEGORY", idList: ids(c.categoryIds) }]
    : c.scope === "variants" ? [{ type: "VARIANT", idList: ids(c.variantIds) }]
    : [];
  const start = trTime(c.startAt), end = trTime(c.endAt);
  return {
    ...(c.ikasId ? { id: String(c.ikasId) } : {}),
    title: String(c.name).trim(),
    type: c.discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "RATIO",
    applicablePrice: c.applicablePrice === "DISCOUNT_PRICE" ? "DISCOUNT_PRICE" : "SELL_PRICE",
    hasCoupon: false,
    canCombineWithOtherCampaigns: c.combine === true,
    applyCampaignToProductPrice: applyToProductPrice,
    fixedDiscount: { amount: Number(c.amount), ...(filters.length ? { filters } : {}) },
    ...(start || end ? { dateRange: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
  };
}

/**
 * ikas'ı panel durumuna getirir (Çok Al Az Öde ile aynı kural): modül pasif ya da kampanya pasifse ikas'tan silinir,
 * aktifse oluşturulur/güncellenir, listeden çıkarılanlar silinir. Önce tümü doğrulanır.
 */
export async function syncDiscountCampaigns(
  store: Store, prev: Settings | null, next: Settings, enabled: boolean,
  opts: { listKey: string; applyToProductPrice: boolean; requireEnd?: boolean },
): Promise<{ settings: Settings; error: string | null }> {
  const of = (s: Settings | null) => ((s?.[opts.listKey] as Camp[] | undefined) ?? []);
  const list = of(next).map((c) => ({ ...c }));
  if (enabled) for (const c of list) if (c.active !== false) {
    const bad = validateDiscount({ ...c, requireEnd: !!opts.requireEnd });
    if (bad) return { settings: next, error: bad };
  }
  const keep = new Set(list.map((c) => String(c.ikasId)).filter(Boolean));
  const removed = of(prev).map((c) => String(c.ikasId)).filter((id) => id && !keep.has(id));
  try {
    if (removed.length) await deleteCampaigns(store, removed);
    for (const c of list) {
      if (!(enabled && c.active !== false)) {
        if (c.ikasId) await deleteCampaigns(store, [String(c.ikasId)]);
        c.ikasId = "";
        continue;
      }
      c.ikasId = await saveCampaign(store, toDiscountInput(c, opts.applyToProductPrice));
    }
  } catch (e) {
    return { settings: { ...next, [opts.listKey]: list }, error: `ikas: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { settings: { ...next, [opts.listKey]: list }, error: null };
}
