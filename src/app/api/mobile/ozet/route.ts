import { getDashboardOrders, getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { withUser } from "@/lib/mobile";

const RANGES = [7, 30, 90];
const r2 = (n: number) => Math.round(n * 100) / 100;
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);

// GET ?gun=7|30|90&magaza=<id> → satış toplamları, günlük seri, en çok satanlar, stok durumu
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const stores = await getStores(user.id);
  const range = RANGES.includes(Number(sp.get("gun"))) ? Number(sp.get("gun")) : 7;
  const selected = stores.find((s) => s.id === sp.get("magaza"));
  const shown = selected ? [selected] : stores;
  const since = new Date(Date.now() - (range - 1) * 24 * 3600_000);
  since.setHours(0, 0, 0, 0);

  const [orders, sharedItems, skuSettings] = await Promise.all([
    shown.length ? getDashboardOrders(user.id, shown.map((s) => s.id), since.toISOString()) : [],
    db.sharedItem.findMany({ where: { userId: user.id }, select: { sku: true, sharedStock: true } }),
    db.skuSetting.findMany({ where: { userId: user.id }, select: { sku: true, lowStockThreshold: true } }),
  ]);
  const thresholds = new Map(skuSettings.map((x) => [x.sku, x.lowStockThreshold]));
  const low = sharedItems.filter((x) => {
    const t = thresholds.get(x.sku) ?? user.lowStockThreshold;
    return t !== null && x.sharedStock <= t;
  }).length;

  const days = Array.from({ length: range }, (_, i) => dayKey(new Date(Date.now() - (range - 1 - i) * 24 * 3600_000)));
  const total = orders.reduce((a, o) => a + o.totalFinalPrice, 0);
  const bySku = new Map<string, { sku: string; ad: string; adet: number; ciro: number }>();
  for (const o of orders)
    for (const l of o.lines) {
      const r = bySku.get(l.sku) ?? { sku: l.sku, ad: l.name, adet: 0, ciro: 0 };
      r.adet += l.quantity;
      r.ciro += (l.finalPrice ?? 0) * l.quantity;
      bySku.set(l.sku, r);
    }

  return Response.json({
    gun: range,
    paraBirimi: orders[0]?.currency ?? "TRY",
    sonSenkron: user.lastSyncAt,
    toplam: { ciro: r2(total), siparis: orders.length, adet: orders.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.quantity, 0), 0), ortalama: orders.length ? r2(total / orders.length) : 0 },
    gunler: days,
    magazalar: shown.map((s) => {
      const mine = orders.filter((o) => o.storeId === s.id);
      const seri = days.map(() => 0);
      for (const o of mine) {
        const i = o.orderedAt ? days.indexOf(dayKey(new Date(o.orderedAt))) : -1;
        if (i >= 0) seri[i] += o.totalFinalPrice;
      }
      return { id: s.id, ad: s.label, ciro: r2(mine.reduce((a, o) => a + o.totalFinalPrice, 0)), siparis: mine.length, seri: seri.map(r2), hata: s.lastError };
    }),
    enCokSatanlar: [...bySku.values()].sort((a, b) => b.adet - a.adet).slice(0, 10).map((x) => ({ ...x, ciro: r2(x.ciro) })),
    stok: { ortak: sharedItems.length, dusuk: low, tukenen: sharedItems.filter((x) => x.sharedStock <= 0).length },
  });
});
