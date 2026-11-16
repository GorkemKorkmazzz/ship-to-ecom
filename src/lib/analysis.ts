// Kârlılık ve stok analizi. Panel sayfası, ana panel ve mobil API aynı hesabı kullanır.
// Finansal hesap merkezi motordadır (src/lib/finance/engine.ts); bu dosya veriyi yükler ve eski yanıt yapısını korur.
// - Para birimleri toplanmaz: özet ana para biriminde (net satışı en yüksek), diğerleri "paraBirimleri" altında ayrıdır.
// - İptal edilen kalemler satışa, iade edilen kalemler net satışa girmez.
// - Maliyet: kalemin sipariş anındaki maliyet snapshot'ı; yoksa maliyet geçmişinde sipariş anında geçerli kayıt; o da yoksa EKSİK.
//   Güncel alış fiyatı geçmişe uygulanmaz; yalnızca ayrı etiketli "tahmini brüt kâr" için kullanılır.
// - Komisyon, kargo, ödeme kesintisi ve KDV henüz yok: ilgili katmanlar null ve "eksik" döner.
import { db } from "./db";
import { computeFinance } from "./finance/engine";
import { fromIkas } from "./finance/sources/ikas";
import { applicable, costAt, loadCosts } from "./finance/costs";
import { adSpendForFinance } from "./ads/products";
import { prorate, type AdInput, type AllocationMethod } from "./finance/engine";

const DAY = 24 * 3600_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type ProductStat = {
  sku: string; ad: string; adet: number; ciro: number; maliyet: number | null; kar: number | null; marj: number | null; maliyetEksik: boolean;
  stok: number | null; gunlukSatis: number; kalanGun: number | null; siparisOnerisi: number;
  paraBirimi: string | null; iptalAdet: number; iadeAdet: number;
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

/**
 * Finans girdilerini yükler ve motora hazır hale getirir (tek yükleme; panel, mobil API ve finans merkezi aynı veriyi kullanır).
 * storeId verilirse yalnızca o mağaza (kullanıcıya ait değilse hiçbir mağaza).
 */
export async function loadFinanceRun(userId: string, range: { start: Date; end: Date; days: number }, opt: { storeId?: string | null } = {}) {
  const stores = await db.store.findMany({ where: { userId, ...(opt.storeId ? { id: opt.storeId } : {}) }, orderBy: { createdAt: "asc" } });
  const storeIds = stores.map((s) => s.id);
  const [orders, variants, shared, settings, user] = await Promise.all([
    // İptal siparişler de yüklenir (brüt satıştan düşülen tutarı göstermek için); taslaklar motor tarafından dışlanır.
    db.order.findMany({
      where: { storeId: { in: storeIds }, store: { userId }, deletedAt: null, status: { not: "DRAFT" }, orderedAt: { gte: range.start, lte: range.end } },
      select: {
        id: true, storeId: true, orderNumber: true, status: true, currency: true, totalFinalPrice: true, orderedAt: true, totalPrice: true, shippingTotal: true, shippingTax: true, finSyncedAt: true,
        lines: { select: { sku: true, name: true, quantity: true, finalPrice: true, status: true, unitCost: true, costCurrency: true, costSource: true, listPrice: true, taxAmount: true } },
      },
    }),
    db.storeVariant.findMany({ where: { storeId: { in: storeIds } }, select: { storeId: true, sku: true, matchSku: true, productName: true, buyPrice: true, currentStock: true } }),
    db.sharedItem.findMany({ where: { userId }, select: { sku: true, sharedStock: true } }),
    db.skuSetting.findMany({ where: { userId }, select: { sku: true, lowStockThreshold: true, excluded: true } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { lowStockThreshold: true, criticalStock: true } }),
  ]);
  const orderIds = orders.map((o) => o.id);
  const [costs, refunds, txns] = await Promise.all([
    loadCosts(userId, storeIds),
    orderIds.length ? db.returnFinancial.findMany({ where: { userId, status: "POSTED", orderId: { in: orderIds } }, select: { orderId: true, amount: true, currency: true } }) : [],
    // Satış giderleri: dönemin siparişlerine bağlı ya da siparişe bağlı olmayıp dönem içinde gerçekleşen DEBIT kayıtlar.
    db.financialTransaction.findMany({
      where: { userId, status: "POSTED", direction: "DEBIT", OR: [{ orderId: { in: orderIds } }, { orderId: null, occurredAt: { gte: range.start, lte: range.end }, OR: [{ storeId: null }, { storeId: { in: storeIds } }] }] },
      select: { orderId: true, type: true, amount: true, currency: true, taxAmount: true, occurredAt: true, allocationMethod: true, allocations: { select: { sku: true, amount: true } } },
    }),
  ]);
  // İşletme giderleri: dönemle kesişen kayıtlar gün bazında paylaştırılır (ör. aylık kira 30 günlük dönemin 10 gününe denk geliyorsa 1/3'ü).
  const trDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  const [opRows, adSpend] = await Promise.all([
    db.expense.findMany({ where: { userId, status: "POSTED", periodStart: { lte: range.end }, periodEnd: { gte: range.start } }, select: { amount: true, currency: true, periodStart: true, periodEnd: true, category: true } }),
    adSpendForFinance(userId, { from: trDay(range.start), to: trDay(range.end) }, storeIds),
  ]);
  const opOf = new Map<string, number>(), opByCat = new Map<string, number>();
  for (const e of opRows) {
    const part = prorate(e.amount, e.periodStart, e.periodEnd, range.start, range.end);
    opOf.set(e.currency, (opOf.get(e.currency) ?? 0) + part);
    opByCat.set(`${e.currency}|${e.category}`, (opByCat.get(`${e.currency}|${e.category}`) ?? 0) + part);
  }
  const currencyOf = new Map(orders.map((o) => [o.id, o.currency]));
  const refundOf = new Map<string, number>();
  for (const r of refunds) if (r.orderId && r.currency === currencyOf.get(r.orderId)) refundOf.set(r.orderId, (refundOf.get(r.orderId) ?? 0) + r.amount);

  const variantOf = new Map(variants.map((v) => [`${v.storeId}|${v.sku}`, v]));

  // Ürün anahtarı: ortak stok anahtarı (matchSku); mağazalar arası aynı ürün birleşir. Maliyet mağazanın kendi alış fiyatıdır.
  const finOrders = orders.map((o) => {
    const snap = new Map(o.lines.map((l) => [l.sku, l]));
    return fromIkas(o, (storeId, sku) => {
      const v = variantOf.get(`${storeId}|${sku}`);
      const base = { key: v?.matchSku || sku, name: v?.productName ?? null, estimateCost: v?.buyPrice ?? null };
      const l = snap.get(sku);
      if (l?.unitCost != null && l.costCurrency === o.currency) return { ...base, unitCost: l.unitCost, costSource: `snapshot:${l.costSource ?? "?"}` };
      const e = o.orderedAt ? costAt(costs.get(`${storeId}|${sku}`) ?? [], o.orderedAt) : null;
      if (applicable(e, o.currency)) return { ...base, unitCost: e!.unitCost, costSource: `history:${e!.source}` };
      return { ...base, unitCost: null, costSource: null };
    }, refundOf.get(o.id) ?? null);
  });
  const engineOpt = {
    expenses: txns.map((t) => ({ currency: t.currency, type: t.type, amount: t.amount, taxAmount: t.taxAmount, orderId: t.orderId, method: (t.allocationMethod as AllocationMethod | null) ?? null, manual: t.allocations })),
    operatingExpenses: opRows.length ? opOf : null,
    // Reklam: ürünle kesin eşleşen harcama ürün anahtarına (ortak stok SKU'su) çevrilir; eşleşen ürün dönemde satılmadıysa motor onu ilişkilendirilemeyene ekler.
    ads: adSpend.known ? [
      ...adSpend.attributed.map((a): AdInput => ({ currency: a.currency, amount: a.amount, key: a.skus.map((sku) => variantOf.get(`${a.storeId}|${sku}`)?.matchSku || sku)[0] ?? null })),
      ...[...adSpend.unattributed.entries()].map(([currency, amount]): AdInput => ({ currency, key: null, amount })),
    ] : null,
  };
  return { stores, storeIds, orders, finOrders, engineOpt, txns, variants, variantOf, shared, settings, user, opByCat, adSpend, trDay };
}

export type FinanceRun = Awaited<ReturnType<typeof loadFinanceRun>>;
export async function buildAnalysis(userId: string, range: { start: Date; end: Date; days: number }, coverDays: number, opt: { storeId?: string | null; run?: FinanceRun } = {}) {
  const { stores, orders, finOrders, engineOpt, variants, shared, settings, user, opByCat } = opt.run ?? (await loadFinanceRun(userId, range, opt));
  const fin = computeFinance(finOrders, engineOpt);
  const sharedOf = new Map(shared.map((s) => [s.sku, s.sharedStock]));
  const setOf = new Map(settings.map((s) => [s.sku, s]));
  const main = fin[0] ?? null;
  const currency = main?.currency ?? orders[0]?.currency ?? "TRY";

  // Mağaza bazlı ciro: ana para biriminde, iptal edilmemiş siparişlerin toplamı.
  const live = orders.filter((o) => o.status !== "CANCELLED");
  const byStore = stores.map((s) => {
    const mine = live.filter((o) => o.storeId === s.id && o.currency === currency);
    return { id: s.id, ad: s.label, ciro: r2(mine.reduce((a, o) => a + o.totalFinalPrice, 0)), siparis: mine.length, paraBirimi: currency, digerParaBirimiSiparis: live.filter((o) => o.storeId === s.id && o.currency !== currency).length };
  });

  // Stok hızı fiziksel satışa bakar: tüm para birimlerindeki net adet toplanır.
  const qtyOf = new Map<string, number>();
  for (const cf of fin) for (const p of cf.products) qtyOf.set(p.key, (qtyOf.get(p.key) ?? 0) + p.soldQty);
  const minStock = new Map<string, number>();
  const nameOf = new Map<string, string>();
  for (const v of variants) {
    if (!v.matchSku) continue;
    minStock.set(v.matchSku, Math.min(minStock.get(v.matchSku) ?? Infinity, v.currentStock));
    if (!nameOf.has(v.matchSku)) nameOf.set(v.matchSku, v.productName);
  }
  const stockOf = (sku: string) => sharedOf.get(sku) ?? minStock.get(sku) ?? null;
  const stockFields = (sku: string) => {
    const adet = qtyOf.get(sku) ?? 0, stok = stockOf(sku), gunlukSatis = adet / range.days;
    return {
      stok, gunlukSatis: Math.round(gunlukSatis * 100) / 100,
      kalanGun: stok === null ? null : gunlukSatis > 0 ? Math.floor(stok / gunlukSatis) : null,
      siparisOnerisi: stok === null || gunlukSatis <= 0 ? 0 : Math.max(0, Math.ceil(gunlukSatis * coverDays - stok)),
    };
  };
  // Satış satırları: ürün × para birimi (farklı para birimleri aynı satırda toplanmaz).
  const salesRows: ProductStat[] = fin.flatMap((cf) => cf.products.filter((p) => !setOf.get(p.key)?.excluded && (p.soldQty > 0 || p.cancelledQty > 0 || p.refundedQty > 0)).map((p) => ({
    sku: p.key, ad: p.name, adet: p.soldQty, ciro: p.netSales, maliyet: p.cost, kar: p.grossProfit, marj: p.margin, maliyetEksik: p.costMissing,
    ...stockFields(p.key), paraBirimi: cf.currency, iptalAdet: p.cancelledQty, iadeAdet: p.refundedQty,
  })));
  // Satışı olmayan ürünler (yalnızca stok takibi için).
  const soldKeys = new Set(salesRows.map((p) => p.sku));
  const stockOnly: ProductStat[] = [...minStock.keys()].filter((k) => !soldKeys.has(k) && !setOf.get(k)?.excluded).map((sku) => ({
    sku, ad: nameOf.get(sku) ?? sku, adet: 0, ciro: 0, maliyet: null, kar: null, marj: null, maliyetEksik: false, ...stockFields(sku), paraBirimi: null, iptalAdet: 0, iadeAdet: 0,
  }));
  const sold = salesRows.filter((p) => p.adet > 0);
  // Stok listeleri ürün başına bir satır (para birimi satırları birleşmiş stok alanlarını paylaşır).
  const perKey = new Map<string, ProductStat>();
  for (const p of [...salesRows, ...stockOnly]) if (!perKey.has(p.sku) || p.paraBirimi === currency) perKey.set(p.sku, p);
  const products = [...perKey.values()];
  const threshold = (sku: string) => setOf.get(sku)?.lowStockThreshold ?? user.lowStockThreshold ?? user.criticalStock;
  const critical = products
    .filter((p) => p.stok !== null && (p.stok <= 0 || (threshold(p.sku) !== null && p.stok <= threshold(p.sku)!) || (p.kalanGun !== null && p.kalanGun <= 7)))
    .sort((a, b) => (a.kalanGun ?? 1e9) - (b.kalanGun ?? 1e9) || (a.stok ?? 0) - (b.stok ?? 0));
  const mainSold = sold.filter((p) => p.paraBirimi === currency);
  const known = mainSold.filter((p) => p.kar !== null);

  return {
    aralik: { baslangic: range.start.toISOString(), bitis: range.end.toISOString(), gun: range.days },
    hedefGun: coverDays,
    paraBirimi: currency,
    ozet: {
      // ciro: ana para biriminde iptal edilmemiş sipariş toplamları (kaynağın sipariş toplamı; kargo vb. içerebilir).
      ciro: main?.orderTotal ?? 0, siparis: main?.orders ?? 0, adet: mainSold.reduce((a, p) => a + p.adet, 0),
      // Brüt kâr finans katmanıyla aynı: maliyeti bilinen tüm kalemler (ürünün bir kısmı eksik olsa da bilinen kalemleri dahil).
      kar: main?.layers.grossProfit.amount ?? 0, karHesaplananCiro: main?.costCoverage.costedNetSales ?? 0,
      maliyetiEksikUrun: mainSold.filter((p) => p.maliyetEksik).length, kritikStok: critical.length,
    },
    // Yeni: katmanlı finans özeti (para birimi başına) ve veri durumu.
    finans: fin.map((cf) => ({ paraBirimi: cf.currency, siparis: cf.orders, siparisToplami: cf.orderTotal, brutAdet: cf.grossQty, netAdet: cf.netQty, katmanlar: cf.layers, dusulenler: cf.deductions, maliyetKapsami: cf.costCoverage, tahmin: cf.estimate, indirim: cf.discounts, kargo: cf.shipping, vergi: cf.tax, giderler: cf.expenses, iadeKaynagi: cf.refundSource, dagitim: cf.allocation, reklam: cf.ads, isletmeGideri: cf.operating.expenses,
      isletmeGideriDokumu: Object.fromEntries([...opByCat.entries()].filter(([k]) => k.startsWith(`${cf.currency}|`)).map(([k, v]) => [k.split("|")[1], Math.round(v * 100) / 100])),
      urunKatki: cf.products.filter((p) => p.soldQty > 0).map((p) => ({ sku: p.key, ad: p.name, netSatis: p.netSales, maliyet: p.cost, brutKar: p.grossProfit, dagitilanGider: p.allocatedExpenses, reklam: p.adSpend, katkiKari: p.contribution })).sort((a, b) => b.netSatis - a.netSatis).slice(0, 100) })),
    maliyetKaynagi: "Sipariş anındaki maliyet (snapshot) ya da o tarihte geçerli maliyet geçmişi kaydı. Güncel alış fiyatı geçmiş siparişlere uygulanmaz; maliyeti bilinmeyen kalemler eksik sayılır.",
    magazalar: byStore,
    enCokSatan: [...sold].sort((a, b) => b.adet - a.adet || b.ciro - a.ciro).slice(0, 10),
    enCokKazandiran: [...known].sort((a, b) => (b.kar ?? 0) - (a.kar ?? 0)).slice(0, 10),
    kritik: critical.slice(0, 50),
    siparisOnerileri: products.filter((p) => p.siparisOnerisi > 0).sort((a, b) => (a.kalanGun ?? 1e9) - (b.kalanGun ?? 1e9)).slice(0, 50),
    urunler: [...sold].sort((a, b) => b.ciro - a.ciro).slice(0, 200),
  };
}
export type Analysis = Awaited<ReturnType<typeof buildAnalysis>>;
