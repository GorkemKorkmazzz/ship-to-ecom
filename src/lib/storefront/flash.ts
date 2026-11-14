// Flash Ürünler: vitrinde gösterilecek kampanya ve ürün kartları (sunucuda hesaplanır).
import type { Store } from "@prisma/client";
import { db } from "../db";
import { cards, inScope, metas, refreshIfStale } from "./catalog";
import { type Scalar, type Settings, inSchedule, parseSettings, sfModule, trTime } from "./modules";

export const FLASH_MODULE = "flash-urunler";
type Camp = Record<string, Scalar>;
export type FlashItem = { id: string; slug: string; name: string; image: string | null; oldPrice: number; newPrice: number; rate: number; inStock: boolean };
export type FlashCampaign = { title: string; description: string; endAt: number | null; items: FlashItem[] };

/** ikas'ın uygulayacağı fiyat: indirim seçilen fiyattan (satış ya da indirimli) hesaplanır. Yuvarlama ikas'ta farklı olabilir. */
export function campaignPrice(c: Camp, sellPrice: number, discountPrice: number | null) {
  const base = c.applicablePrice === "DISCOUNT_PRICE" ? (discountPrice ?? sellPrice) : sellPrice;
  const a = Number(c.amount) || 0;
  const v = c.discountType === "FIXED_AMOUNT" ? base - a : base * (1 - a / 100);
  return Math.max(0, Math.round(v * 100) / 100);
}

/**
 * Kampanyaların ürün kartları. live=true: yalnızca ikas'ta oluşturulmuş, aktif ve tarih aralığındaki kampanyalar.
 * Gösterilen eski fiyat, müşterinin şu an gördüğü fiyattır (indirimli fiyat varsa o); kampanya fiyatı bundan düşük değilse ürün listelenmez.
 */
export async function flashFeed(store: Pick<Store, "id" | "merchantId">, s: Settings, live: boolean): Promise<FlashCampaign[]> {
  const camps = ((s.campaigns as Camp[]) ?? []).filter((c) => !live || (c.active !== false && c.ikasId && inSchedule(c)));
  if (!camps.length) return [];
  const all = await metas(store.id);
  const limit = Number(s.limit) || 8;
  const out: FlashCampaign[] = [];
  for (const c of camps) {
    const scope = inScope(all, c.scope, c.productIds, c.categoryIds);
    let items = (await cards(store, [...scope], all)).map((k) => {
      const old = k.discountPrice ?? k.sellPrice;
      const np = campaignPrice(c, k.sellPrice, k.discountPrice);
      return { id: k.productId, slug: k.slug, name: k.name, image: k.image, oldPrice: old, newPrice: np, rate: old > 0 ? Math.round((1 - np / old) * 100) : 0, inStock: k.stock > 0 };
    }).filter((i) => i.newPrice < i.oldPrice && (!s.hideOutOfStock || i.inStock));
    const by: Record<string, (a: FlashItem, b: FlashItem) => number> = {
      discount: (a, b) => b.rate - a.rate, priceAsc: (a, b) => a.newPrice - b.newPrice, priceDesc: (a, b) => b.newPrice - a.newPrice, name: (a, b) => a.name.localeCompare(b.name, "tr"),
    };
    items = items.sort(by[String(s.sort)] ?? by.discount).slice(0, limit);
    const end = trTime(c.endAt);
    if (items.length) out.push({ title: String(c.title || c.name), description: String(c.description || ""), endAt: Number.isFinite(end) ? end : null, items });
  }
  return out;
}

/** Herkese açık uç için: mağaza anahtarından canlı akış. Modül kapalıysa null. */
export async function publicFlash(sfKey: string) {
  const store = await db.store.findUnique({ where: { sfKey }, include: { user: { select: { plan: true, suspended: true, paidUntil: true, trialEndsAt: true } }, sfModules: { where: { moduleKey: FLASH_MODULE } } } });
  const row = store?.sfModules[0];
  if (!store || !row?.enabled || !row.publishedAt) return null;
  const { hasModule } = await import("../access");
  if (!hasModule(store.user, "vitrin") || store.user.suspended) return null;
  refreshIfStale(store.id);
  return flashFeed(store, parseSettings(sfModule(FLASH_MODULE)!, row.settings), true);
}
