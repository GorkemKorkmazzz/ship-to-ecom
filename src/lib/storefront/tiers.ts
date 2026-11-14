// Çok Al Az Öde: panel kampanyalarını ikas'ta kademeli indirim (CampaignInput.tieredDiscount) olarak tutar.
// İndirimi ikas uygular; bu dosya yalnızca kampanyayı oluşturur, günceller, siler ve siparişlerden sonucu ölçer.
// Şema ikas Admin API introspection ile doğrulandı: tieredDiscount { rules: [{ amount, lineItemQuantityRange { min max } }], filters: [{ type, idList }] }.
import type { Store } from "@prisma/client";
import { db } from "../db";
import { deleteCampaigns, saveCampaign } from "../ikas";
import { type Scalar, type Settings, trTime } from "./modules";

export const TIER_MODULE = "cok-al-az-ode";
type Camp = Record<string, Scalar>;
export type Tier = { qty: number; amount: number };

/** Doldurulmuş kademeler, adede göre sıralı. */
export function tiersOf(c: Camp): Tier[] {
  return [1, 2, 3, 4]
    .map((n) => ({ qty: Number(c[`t${n}q`]), amount: Number(c[`t${n}a`]) }))
    .filter((t) => Number.isFinite(t.qty) && t.qty >= 2 && Number.isFinite(t.amount) && t.amount > 0)
    .sort((a, b) => a.qty - b.qty);
}

/** Yayınlanmadan önce kontrol: hata mesajı ya da null. */
export function validate(c: Camp): string | null {
  const name = String(c.name || "").trim();
  if (!name) return "Kampanya adı boş olamaz.";
  const t = tiersOf(c);
  if (!t.length) return `${name}: en az bir kademe girin (en az 2 adet ve 0'dan büyük indirim).`;
  if (new Set(t.map((x) => x.qty)).size !== t.length) return `${name}: aynı adet iki kademede kullanılamaz.`;
  for (let i = 1; i < t.length; i++) if (t[i].amount <= t[i - 1].amount) return `${name}: üst kademenin indirimi alttakinden büyük olmalı.`;
  if (c.discountType === "RATIO" && t.some((x) => x.amount > 100)) return `${name}: yüzde indirim 100'ü geçemez.`;
  if (c.scope === "products" && !String(c.productIds)) return `${name}: en az bir ürün seçin.`;
  if (c.scope === "categories" && !String(c.categoryIds)) return `${name}: en az bir kategori seçin.`;
  const a = trTime(c.startAt), b = trTime(c.endAt);
  if (a && b && b <= a) return `${name}: bitiş başlangıçtan sonra olmalı.`;
  return null;
}

/** Panel kaydını ikas CampaignInput'una çevirir. Kademe aralığı: [adet, sonraki kademe adedi - 1]. */
export function toIkasInput(c: Camp) {
  const t = tiersOf(c);
  const ids = (v: Scalar) => String(v).split(",").filter(Boolean);
  const filters =
    c.scope === "products" ? [{ type: "PRODUCT", idList: ids(c.productIds) }] : c.scope === "categories" ? [{ type: "CATEGORY", idList: ids(c.categoryIds) }] : [];
  const start = trTime(c.startAt), end = trTime(c.endAt);
  return {
    ...(c.ikasId ? { id: String(c.ikasId) } : {}),
    title: String(c.name).trim(),
    type: c.discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "RATIO",
    applicablePrice: c.applicablePrice === "DISCOUNT_PRICE" ? "DISCOUNT_PRICE" : "SELL_PRICE",
    hasCoupon: false,
    canCombineWithOtherCampaigns: c.combine === true,
    tieredDiscount: {
      ...(filters.length ? { filters } : {}),
      rules: t.map((x, i) => ({ amount: x.amount, lineItemQuantityRange: { min: x.qty, ...(t[i + 1] ? { max: t[i + 1].qty - 1 } : {}) } })),
    },
    ...(start || end ? { dateRange: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
  };
}

const camps = (s: Settings | null) => ((s?.campaigns as Camp[] | undefined) ?? []);

/**
 * ikas'ı panel durumuna getirir. enabled=false ya da kampanya pasifse ikas'taki kampanya silinir;
 * aktifse oluşturulur/güncellenir. Listeden çıkarılan kampanyalar ikas'tan silinir.
 * Dönen ayarlar ikas kimlikleriyle günceldir. Hata olursa işlem yarıda kalabilir; kimlikler yine doğru döner.
 */
export async function syncTierCampaigns(store: Store, prev: Settings | null, next: Settings, enabled: boolean): Promise<{ settings: Settings; error: string | null }> {
  const list = camps(next).map((c) => ({ ...c }));
  const keep = new Set(list.map((c) => String(c.ikasId)).filter(Boolean));
  const removed = camps(prev).map((c) => String(c.ikasId)).filter((id) => id && !keep.has(id));
  // Önce tümü doğrulanır: hatalı kayıt varsa ikas'a hiçbir istek gitmez.
  if (enabled) for (const c of list) if (c.active !== false) {
    const bad = validate(c);
    if (bad) return { settings: next, error: bad };
  }
  let error: string | null = null;
  try {
    if (removed.length) await deleteCampaigns(store, removed);
    for (const c of list) {
      const want = enabled && c.active !== false;
      if (!want) {
        if (c.ikasId) await deleteCampaigns(store, [String(c.ikasId)]);
        c.ikasId = "";
        continue;
      }
      c.ikasId = await saveCampaign(store, toIkasInput(c));
    }
  } catch (e) {
    error = `ikas: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { settings: { ...next, campaigns: list }, error };
}

/**
 * Siparişlerden kampanya sonucu: ikas siparişin indirim satırlarına (orderAdjustments) kampanya adını yazar.
 * Senkron bunları Order.campaigns alanına { name, type, amount } olarak kaydeder.
 */
export async function tierOrderStats(storeId: string, names: string[], days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const orders = await db.order.findMany({
    where: { storeId, orderedAt: { gte: since }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, campaigns: { not: "[]" } },
    select: { totalFinalPrice: true, campaigns: true, currency: true },
  });
  const want = new Set(names.map((n) => n.trim().toLocaleLowerCase("tr")));
  let count = 0, revenue = 0, discount = 0;
  const currency = orders[0]?.currency ?? "TRY";
  for (const o of orders) {
    let adj: { name?: string; amount?: number }[] = [];
    try {
      adj = JSON.parse(o.campaigns ?? "[]");
    } catch {}
    const hit = adj.filter((a) => a.name && want.has(a.name.trim().toLocaleLowerCase("tr")));
    if (!hit.length) continue;
    count++;
    revenue += o.totalFinalPrice;
    discount += hit.reduce((x, a) => x + (Number(a.amount) || 0), 0);
  }
  return { count, revenue, discount, currency };
}
