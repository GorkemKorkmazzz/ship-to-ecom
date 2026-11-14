// Ürün Etiketleri: hangi ürüne hangi etiketin gösterileceği sunucuda, gerçek verilerden hesaplanır.
// Fiyat/stok: StoreVariant (ikas senkronu) · yeni ürün: ProductMeta.createdAt (ikas) · çok satan: OrderLine (ikas siparişleri).
import type { Store } from "@prisma/client";
import { db } from "../db";
import { cards, inScope, metas, refreshIfStale } from "./catalog";
import { type Scalar, type Settings, inSchedule, parseSettings, sfModule } from "./modules";

export const LABEL_MODULE = "urun-etiketleri";
type Label = Record<string, Scalar>;

/** Sonuç: ürün kimliği → [etiket sırası, indirim oranı] listesi (öncelik sırasıyla) ve ürün kimliği → slug. */
export async function computeLabels(store: Pick<Store, "id" | "merchantId">, s: Settings) {
  const labels = ((s.labels as Label[]) ?? []).map((l, i) => ({ l, i })).filter(({ l }) => l.active !== false && inSchedule(l));
  const all = await metas(store.id);
  const map: Record<string, [number, number][]> = {};
  if (!labels.length || !all.length) return { map, slugs: {} as Record<string, string>, labeled: [] as string[] };
  const ks = await cards(store, all.map((m) => m.productId), all);
  const byId = new Map(ks.map((k) => [k.productId, k]));
  const created = new Map(all.map((m) => [m.productId, m.createdAt]));

  // Çok satan: kuralın gün aralığındaki satış adedi (SKU → ürün).
  const best = new Map<number, Set<string>>();
  for (const { l, i } of labels.filter(({ l }) => l.rule === "bestseller")) {
    const since = new Date(Date.now() - (Number(l.bestsellerDays) || 30) * 86_400_000);
    const lines = await db.orderLine.groupBy({ by: ["sku"], where: { order: { storeId: store.id, orderedAt: { gte: since }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } } }, _sum: { quantity: true } });
    const skuTo = new Map((await db.storeVariant.findMany({ where: { storeId: store.id }, select: { sku: true, productId: true } })).map((v) => [v.sku, v.productId]));
    const qty = new Map<string, number>();
    for (const r of lines) { const p = skuTo.get(r.sku); if (p) qty.set(p, (qty.get(p) ?? 0) + (r._sum.quantity ?? 0)); }
    best.set(i, new Set([...qty.entries()].filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]).slice(0, Number(l.ruleValue) || 10).map(([p]) => p)));
  }

  for (const { l, i } of labels) {
    const scope = inScope(all, l.scope, l.productIds, l.categoryIds);
    const v = Number(l.ruleValue) || 0;
    for (const pid of scope) {
      const k = byId.get(pid);
      let ok = false, rate = 0;
      switch (l.rule) {
        case "discount":
          if (k?.discountPrice != null && k.sellPrice > 0) { rate = Math.round((1 - k.discountPrice / k.sellPrice) * 100); ok = rate > 0 && rate >= v; }
          break;
        case "new": { const c = created.get(pid); ok = !!c && Date.now() - c.getTime() <= (v || 14) * 86_400_000; break; }
        case "lowStock": ok = !!k && k.stock > 0 && k.stock <= (v || 5); break;
        case "outOfStock": ok = !!k && k.stock <= 0; break;
        case "bestseller": ok = !!best.get(i)?.has(pid); break;
        default: ok = true;
      }
      if (ok) (map[pid] ??= []).push([i, rate]);
    }
  }
  const slugs = Object.fromEntries(all.filter((m) => map[m.productId] && m.slug).map((m) => [m.productId, m.slug]));
  return { map, slugs, labeled: Object.keys(map) };
}

export async function publicLabels(sfKey: string) {
  const store = await db.store.findUnique({ where: { sfKey }, include: { user: { select: { plan: true, suspended: true, paidUntil: true, trialEndsAt: true } }, sfModules: { where: { moduleKey: LABEL_MODULE } } } });
  const row = store?.sfModules[0];
  if (!store || !row?.enabled || !row.publishedAt) return null;
  const { hasModule } = await import("../access");
  if (!hasModule(store.user, "vitrin") || store.user.suspended) return null;
  refreshIfStale(store.id);
  const { map, slugs } = await computeLabels(store, parseSettings(sfModule(LABEL_MODULE)!, row.settings));
  return { map, slugs };
}

/** Panel: şu an etiketli ürünlerin son 30 gün satışı (etiketin etkisini değil, etiketli ürünlerin toplamını gösterir). */
export async function labelStats(store: Pick<Store, "id" | "merchantId">, s: Settings) {
  const { labeled, map } = await computeLabels(store, s);
  if (!labeled.length) return { products: 0, qty: 0, revenue: 0, perLabel: [] as number[] };
  const skus = (await db.storeVariant.findMany({ where: { storeId: store.id, productId: { in: labeled } }, select: { sku: true } })).map((v) => v.sku);
  const lines = await db.orderLine.findMany({ where: { sku: { in: skus }, order: { storeId: store.id, orderedAt: { gte: new Date(Date.now() - 30 * 86_400_000) }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } } }, select: { quantity: true, finalPrice: true } });
  const n = ((s.labels as Label[]) ?? []).length;
  const perLabel = Array.from({ length: n }, (_, i) => Object.values(map).filter((x) => x.some(([j]) => j === i)).length);
  return { products: labeled.length, qty: lines.reduce((a, l) => a + l.quantity, 0), revenue: lines.reduce((a, l) => a + (l.finalPrice ?? 0) * l.quantity, 0), perLabel };
}
