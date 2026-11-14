// Merkezi kârlılık ve stok analizi. Panel sayfası ve mobil API aynı hesabı kullanır.
// Maliyet: mağazadaki alış fiyatı (buyPrice). Alış fiyatı olmayan satırda kâr hesaplanmaz.
// Komisyon, kargo ve vergi dahil değildir.
import { db } from "./db";

const DAY = 24 * 3600_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ProductStat = {
  sku: string; ad: string; adet: number; ciro: number; maliyet: number | null; kar: number | null; marj: number | null; maliyetEksik: boolean;
  stok: number | null; gunlukSatis: number; kalanGun: number | null; siparisOnerisi: number;
};

/** Tarih aralığını doğrular: en fazla 366 gün, bitiş bugünü geçemez. */
export function parseRange(from?: string | null, to?: string | null) {
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T23:59:59.999+03:00`) : new Date();
  const trDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  // Varsayılan: bitiş dahil son 30 gün, Türkiye saatiyle gün başından.
  const start = new Date(`${from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : trDay(new Date(end.getTime() - 29 * DAY))}T00:00:00+03:00`);
  const safeEnd = new Date(Math.min(end.getTime(), Date.now()));
  const safeStart = new Date(Math.max(Math.min(start.getTime(), safeEnd.getTime()), safeEnd.getTime() - 366 * DAY));
  return { start: safeStart, end: safeEnd, days: Math.max(1, Math.ceil((safeEnd.getTime() - safeStart.getTime()) / DAY)) };
}

export async function buildAnalysis(userId: string, range: { start: Date; end: Date; days: number }, coverDays: number) {
  const stores = await db.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const storeIds = stores.map((s) => s.id);
  const [orders, variants, shared, settings, user] = await Promise.all([
    db.order.findMany({
      where: { storeId: { in: storeIds }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, orderedAt: { gte: range.start, lte: range.end } },
      select: { storeId: true, currency: true, totalFinalPrice: true, lines: { select: { sku: true, name: true, quantity: true, finalPrice: true } } },
    }),
    db.storeVariant.findMany({ where: { storeId: { in: storeIds } }, select: { storeId: true, sku: true, matchSku: true, productName: true, buyPrice: true, currentStock: true } }),
    db.sharedItem.findMany({ where: { userId }, select: { sku: true, sharedStock: true } }),
    db.skuSetting.findMany({ where: { userId }, select: { sku: true, lowStockThreshold: true, excluded: true } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { lowStockThreshold: true, criticalStock: true } }),
  ]);

  const variantOf = new Map(variants.map((v) => [`${v.storeId}|${v.sku}`, v]));
  const sharedOf = new Map(shared.map((s) => [s.sku, s.sharedStock]));
  const setOf = new Map(settings.map((s) => [s.sku, s]));

  // Mağaza bazlı ciro
  const byStore = stores.map((s) => {
    const mine = orders.filter((o) => o.storeId === s.id);
    return { id: s.id, ad: s.label, ciro: r2(mine.reduce((a, o) => a + o.totalFinalPrice, 0)), siparis: mine.length };
  });

  // Ürün bazlı satış ve kâr (ortak stok anahtarı = matchSku üzerinden birleştirilir)
  type Acc = { sku: string; ad: string; adet: number; ciro: number; maliyet: number; maliyetEksik: boolean };
  const acc = new Map<string, Acc>();
  for (const o of orders)
    for (const l of o.lines) {
      const v = variantOf.get(`${o.storeId}|${l.sku}`);
      const key = v?.matchSku || l.sku;
      if (!key) continue;
      const a = acc.get(key) ?? { sku: key, ad: l.name || v?.productName || key, adet: 0, ciro: 0, maliyet: 0, maliyetEksik: false };
      a.adet += l.quantity;
      a.ciro += (l.finalPrice ?? 0) * l.quantity;
      if (v?.buyPrice !== null && v?.buyPrice !== undefined) a.maliyet += v.buyPrice * l.quantity;
      else a.maliyetEksik = true;
      acc.set(key, a);
    }

  // Stok: ortak stok varsa o, yoksa (tek mağazada) mağaza stoğu
  const minStock = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const v of variants) {
    if (!v.matchSku) continue;
    minStock.set(v.matchSku, Math.min(minStock.get(v.matchSku) ?? Infinity, v.currentStock));
    if (!nameOf.has(v.matchSku)) nameOf.set(v.matchSku, v.productName);
  }
  const stockOf = (sku: string) => sharedOf.get(sku) ?? minStock.get(sku) ?? null;
  const keys = new Set([...acc.keys(), ...minStock.keys()]);
  const products: ProductStat[] = [...keys].filter((k) => !setOf.get(k)?.excluded).map((sku) => {
    const a = acc.get(sku);
    const adet = a?.adet ?? 0;
    const stok = stockOf(sku);
    const gunlukSatis = adet / range.days;
    const kalanGun = stok === null ? null : gunlukSatis > 0 ? Math.floor(stok / gunlukSatis) : null;
    const siparisOnerisi = stok === null || gunlukSatis <= 0 ? 0 : Math.max(0, Math.ceil(gunlukSatis * coverDays - stok));
    const hasCost = !!a && !a.maliyetEksik;
    const kar = hasCost ? r2(a!.ciro - a!.maliyet) : null;
    return {
      sku, ad: a?.ad ?? nameOf.get(sku) ?? sku, adet, ciro: r2(a?.ciro ?? 0),
      maliyet: hasCost ? r2(a!.maliyet) : null, kar, marj: kar !== null && a!.ciro > 0 ? Math.round((kar / a!.ciro) * 1000) / 10 : null, maliyetEksik: !!a && a.maliyetEksik,
      stok, gunlukSatis: Math.round(gunlukSatis * 100) / 100, kalanGun, siparisOnerisi,
    };
  });

  const sold = products.filter((p) => p.adet > 0);
  const threshold = (sku: string) => setOf.get(sku)?.lowStockThreshold ?? user.lowStockThreshold ?? user.criticalStock;
  const critical = products
    .filter((p) => p.stok !== null && (p.stok <= 0 || (threshold(p.sku) !== null && p.stok <= threshold(p.sku)!) || (p.kalanGun !== null && p.kalanGun <= 7)))
    .sort((a, b) => (a.kalanGun ?? 1e9) - (b.kalanGun ?? 1e9) || (a.stok ?? 0) - (b.stok ?? 0));
  const ciro = orders.reduce((a, o) => a + o.totalFinalPrice, 0);
  const known = sold.filter((p) => p.kar !== null);

  return {
    aralik: { baslangic: range.start.toISOString(), bitis: range.end.toISOString(), gun: range.days },
    hedefGun: coverDays,
    paraBirimi: orders[0]?.currency ?? "TRY",
    ozet: {
      ciro: r2(ciro), siparis: orders.length, adet: sold.reduce((a, p) => a + p.adet, 0),
      kar: r2(known.reduce((a, p) => a + (p.kar ?? 0), 0)), karHesaplananCiro: r2(known.reduce((a, p) => a + p.ciro, 0)),
      maliyetiEksikUrun: sold.filter((p) => p.maliyetEksik).length, kritikStok: critical.length,
    },
    magazalar: byStore,
    enCokSatan: [...sold].sort((a, b) => b.adet - a.adet || b.ciro - a.ciro).slice(0, 10),
    enCokKazandiran: [...known].sort((a, b) => (b.kar ?? 0) - (a.kar ?? 0)).slice(0, 10),
    kritik: critical.slice(0, 50),
    siparisOnerileri: products.filter((p) => p.siparisOnerisi > 0).sort((a, b) => (a.kalanGun ?? 1e9) - (b.kalanGun ?? 1e9)).slice(0, 50),
    urunler: [...sold].sort((a, b) => b.ciro - a.ciro).slice(0, 200),
  };
}
export type Analysis = Awaited<ReturnType<typeof buildAnalysis>>;
