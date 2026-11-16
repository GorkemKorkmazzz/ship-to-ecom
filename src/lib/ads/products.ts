// Ürün bazlı reklam analizi. İki AYRI kaynak yan yana gösterilir, birbirine eklenmez:
//  A) Platformun ürün kırılımı (AdProductDaily): harcama, gösterim, tıklama; Google'da platform dönüşümü/değeri.
//     Meta ürün başına dönüşüm vermez (site dışı eylemlerde kırılım değeri yok) → desteklenmiyor.
//  B) ikas gerçek satışları: siparişin UTM kaynağı seçili platformsa (son tıklama UTM'si, ikas'ın kaydettiği) sipariş satırları
//     SKU ile ürüne bağlanır. Her siparişin tek utm_source değeri vardır → bir sipariş en fazla bir platforma yazılır.
// Ürüne harcama yalnızca platformun ürün kırılımıyla bağlanır; kampanya harcaması ürünlere dağıtılmaz (tahmin yok).
// Eşleştirme sırası: ürün kimliği → varyant kimliği → SKU → barkod (kesin). Ürün adı yalnızca "olası eşleşme" önerisidir, sayılmaz.
import { db } from "../db";
import { imageUrl } from "../pricing";
import type { AdPlatform } from "./platform";
import { coverageOf, prevRangeOf } from "./report";

export const PRODUCT_SORTS = { spend: "En yüksek harcama", revenue: "En yüksek ciro", roas: "En yüksek ROAS", qty: "En yüksek satış adedi", cpa: "En düşük CPA", ctr: "En yüksek CTR" } as const;
export const PRODUCT_STATUS = { iyi: "Yüksek performans", dusuk: "Düşük performans", satissiz: "Harcama var, satış yok", yetersiz: "Yetersiz veri", reklamsiz: "Reklam verisi yok" } as const;
export type ProductStatus = keyof typeof PRODUCT_STATUS;
export const MATCH_LABEL = { productId: "Ürün kimliği", variantId: "Varyant kimliği", sku: "SKU", barcode: "Barkod" } as const;
type MatchBy = keyof typeof MATCH_LABEL;

type Range = { from: string; to: string; days: number };
type Filter = { siteId?: string | null; platform: AdPlatform; campaignId?: string | null; category?: string | null; q?: string | null; sku?: string | null; status?: string | null; sort?: string | null };

// Ücretli trafik UTM eşlemesi (yaygın değerler). Ortam ücretli değilse (ör. google/organic) reklam satışı sayılmaz.
const PAID_MEDIUM = /(^|[_-])(cpc|ppc|paid|paidsocial|paid_social|ads?|pmax|shopping|display|cpm)($|[_-])/i;
const SOURCES: Record<AdPlatform, RegExp> = { meta: /^(facebook|fb|instagram|ig|meta|messenger|audience_network)$/i, google: /^(google|adwords|googleads|google_ads|youtube)$/i };
export const utmPlatform = (source: string | null, medium: string | null): AdPlatform | null => {
  if (!source || !medium || !PAID_MEDIUM.test(medium.replace(/\s+/g, ""))) return null;
  return SOURCES.meta.test(source.trim()) ? "meta" : SOURCES.google.test(source.trim()) ? "google" : null;
};
const norm = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const pct = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : (a / b) * 100);
const div = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : a / b);

type Product = { key: string; storeId: string; productId: string; name: string; skus: string[]; barcodes: string[]; variantIds: string[]; image: string | null; price: number | null; stock: number; category: string | null };

/** Kapsamdaki mağazaların ürün kataloğu (StoreVariant, ürün kimliğine göre gruplanır). */
async function catalog(userId: string, storeIds: string[]) {
  const [variants, settings, stores] = await Promise.all([
    db.storeVariant.findMany({ where: { storeId: { in: storeIds }, store: { userId } }, select: { storeId: true, productId: true, variantId: true, productName: true, sku: true, barcode: true, imageId: true, sellPrice: true, discountPrice: true, currentStock: true } }),
    db.skuSetting.findMany({ where: { userId, category: { not: null } }, select: { sku: true, category: true } }),
    db.store.findMany({ where: { id: { in: storeIds }, userId }, select: { id: true, merchantId: true } }),
  ]);
  const cat = new Map(settings.map((s) => [s.sku, s.category]));
  const merchant = new Map(stores.map((s) => [s.id, s.merchantId]));
  const map = new Map<string, Product>();
  for (const v of variants) {
    const key = `${v.storeId}~${v.productId}`;
    const p = map.get(key) ?? { key, storeId: v.storeId, productId: v.productId, name: v.productName, skus: [], barcodes: [], variantIds: [], image: imageUrl(merchant.get(v.storeId), v.imageId, 180), price: v.discountPrice ?? v.sellPrice, stock: 0, category: null };
    if (v.sku) p.skus.push(v.sku);
    if (v.barcode) p.barcodes.push(v.barcode);
    p.variantIds.push(v.variantId);
    p.stock += v.currentStock;
    p.category ??= (v.sku && cat.get(v.sku)) || null;
    p.image ??= imageUrl(merchant.get(v.storeId), v.imageId, 180);
    map.set(key, p);
  }
  return [...map.values()];
}

/** Platform ürün anahtarı → ikas ürünü. Birden fazla ürüne denk gelen anahtar belirsizdir, eşleşme sayılmaz. */
function matcher(products: Product[]) {
  const idx: Record<MatchBy, Map<string, Set<string>>> = { productId: new Map(), variantId: new Map(), sku: new Map(), barcode: new Map() };
  const put = (m: Map<string, Set<string>>, k: string, v: string) => m.set(k, (m.get(k) ?? new Set()).add(v));
  const byName = new Map<string, string[]>();
  for (const p of products) {
    put(idx.productId, p.productId, p.key);
    for (const x of p.variantIds) put(idx.variantId, x, p.key);
    for (const x of p.skus) put(idx.sku, x.toLowerCase(), p.key);
    for (const x of p.barcodes) put(idx.barcode, x, p.key);
    byName.set(norm(p.name), [...(byName.get(norm(p.name)) ?? []), p.key]);
  }
  return (key: string, title: string | null): { product: string; by: MatchBy } | { product: null; reason: string; candidate: string | null } => {
    for (const by of ["productId", "variantId", "sku", "barcode"] as MatchBy[]) {
      const hit = idx[by].get(by === "sku" ? key.toLowerCase() : key);
      if (hit?.size === 1) return { product: [...hit][0], by };
      if (hit && hit.size > 1) return { product: null, reason: `${MATCH_LABEL[by]} birden fazla ürüne denk geliyor (belirsiz)`, candidate: null };
    }
    const cand = title ? byName.get(norm(title)) : undefined;
    return { product: null, reason: cand ? "Yalnızca ürün adı benziyor; ad eşleşmesi kesin kabul edilmez" : "Katalogda kimlik, SKU veya barkod karşılığı yok", candidate: cand?.length === 1 ? cand[0] : null };
  };
}

type Ad = { spend: number | null; impressions: number; clicks: number; conversions: number | null; value: number | null };
const emptyAd = (conv: boolean): Ad => ({ spend: 0, impressions: 0, clicks: 0, conversions: conv ? 0 : null, value: conv ? 0 : null });
const addAd = (a: Ad, r: { spend: number | null; impressions: number; clicks: number; conversions: number | null; conversionValue: number | null }) => {
  a.spend = a.spend === null || r.spend === null ? null : a.spend + r.spend; // bir gün bile harcama dönmediyse toplam bilinmez
  a.impressions += r.impressions; a.clicks += r.clicks;
  a.conversions = a.conversions === null || r.conversions === null ? null : a.conversions + r.conversions;
  a.value = a.value === null || r.conversionValue === null ? null : a.value + r.conversionValue;
};
type Sale = { orders: Set<string>; qty: number; revenue: number };

async function load(userId: string, range: { from: string; to: string }, f: Filter) {
  const sites = await db.website.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, storeId: true } });
  const site = f.siteId ? sites.find((s) => s.id === f.siteId) ?? null : null;
  const accounts = await db.adAccount.findMany({
    where: { selected: true, provider: f.platform, integration: { userId }, ...(site ? { websites: { some: { websiteId: site.id } } } : {}) },
    select: { id: true, name: true, currency: true, metricsFrom: true, metricsSyncedAt: true, productSyncedAt: true, productError: true, integration: { select: { externalUserId: true } }, websites: { select: { website: { select: { storeId: true } } } } },
  });
  const ids = accounts.map((a) => a.id);
  const campaigns = ids.length ? await db.adCampaign.findMany({ where: { adAccountId: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true, adAccountId: true } }) : [];
  const campaignId = f.campaignId && campaigns.some((c) => c.id === f.campaignId) ? f.campaignId : null;
  const storeIds = [...new Set((site ? [site.storeId] : sites.map((s) => s.storeId)).filter((x): x is string => !!x))];
  return { sites, site, accounts, ids, campaigns, campaignId, storeIds };
}

async function compute(userId: string, range: { from: string; to: string }, f: Filter, L: Awaited<ReturnType<typeof load>>, products: Product[]) {
  const conv = f.platform === "google";
  const match = matcher(products);
  const productRows = L.ids.length
    ? await db.adProductDaily.findMany({ where: { adAccountId: { in: L.ids }, date: { gte: range.from, lte: range.to }, ...(L.campaignId ? { campaignId: L.campaignId } : {}) } })
    : [];
  // Ürün başına reklam: aynı ürünün tüm kampanya × gün × varyant anahtarları toplanır (platform her gösterimi bir kez raporlar).
  const ad = new Map<string, Ad>();
  const adByCampaign = new Map<string, Map<string, Ad>>();
  const matchedBy = new Map<string, Set<MatchBy>>();
  const unmatched = new Map<string, { key: string; title: string | null; reason: string; candidate: string | null; ad: Ad; campaigns: Set<string> }>();
  for (const r of productRows) {
    const m = match(r.productKey, r.productTitle);
    if (m.product !== null) {
      addAd(ad.get(m.product) ?? ad.set(m.product, emptyAd(conv)).get(m.product)!, r);
      const cm = adByCampaign.get(m.product) ?? adByCampaign.set(m.product, new Map()).get(m.product)!;
      addAd(cm.get(r.campaignId) ?? cm.set(r.campaignId, emptyAd(conv)).get(r.campaignId)!, r);
      matchedBy.set(m.product, (matchedBy.get(m.product) ?? new Set()).add(m.by));
    } else if (!m.product) {
      const u = unmatched.get(r.productKey) ?? { key: r.productKey, title: r.productTitle, reason: m.reason, candidate: m.candidate, ad: emptyAd(conv), campaigns: new Set<string>() };
      addAd(u.ad, r); u.campaigns.add(r.campaignId);
      unmatched.set(r.productKey, u);
    }
  }
  // ikas satışları (UTM'si seçili platform olan siparişler). Kampanya filtresinde utm_campaign = kampanya adı (birebir).
  const campaignName = L.campaignId ? L.campaigns.find((c) => c.id === L.campaignId)!.name : null;
  const orders = L.storeIds.length
    ? await db.order.findMany({
        where: { storeId: { in: L.storeIds }, store: { userId }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, utmSource: { not: null }, orderedAt: { gte: new Date(`${range.from}T00:00:00+03:00`), lte: new Date(`${range.to}T23:59:59.999+03:00`) } },
        select: { id: true, storeId: true, orderedAt: true, currency: true, utmSource: true, utmMedium: true, utmCampaign: true, lines: { select: { sku: true, quantity: true, finalPrice: true, status: true } } },
      })
    : [];
  const bySku = new Map<string, string>();
  for (const p of products) for (const s of p.skus) bySku.set(`${p.storeId}|${s}`, p.key);
  const sale = new Map<string, Sale>();
  const saleByCampaign = new Map<string, Map<string, Sale>>();
  const totalOrders = new Set<string>();
  let unmatchedLines = 0, unmatchedRevenue = 0;
  for (const o of orders) {
    const d = day(o.orderedAt!);
    if (d < range.from || d > range.to || utmPlatform(o.utmSource, o.utmMedium) !== f.platform) continue;
    if (campaignName && o.utmCampaign !== campaignName) continue;
    for (const l of o.lines) {
      if (l.status && /CANCEL|REFUND/.test(l.status)) continue;
      totalOrders.add(o.id); // tüm satırları iptal/iade olan sipariş sayılmaz
      const k = bySku.get(`${o.storeId}|${l.sku}`);
      const rev = (l.finalPrice ?? 0) * l.quantity;
      if (!k) { unmatchedLines++; unmatchedRevenue += rev; continue; }
      const s = sale.get(k) ?? sale.set(k, { orders: new Set(), qty: 0, revenue: 0 }).get(k)!;
      s.orders.add(o.id); s.qty += l.quantity; s.revenue += rev;
      const cn = o.utmCampaign ?? "(utm_campaign yok)";
      const cm = saleByCampaign.get(k) ?? saleByCampaign.set(k, new Map()).get(k)!;
      const cs = cm.get(cn) ?? cm.set(cn, { orders: new Set(), qty: 0, revenue: 0 }).get(cn)!;
      cs.orders.add(o.id); cs.qty += l.quantity; cs.revenue += rev;
    }
  }
  return { ad, adByCampaign, matchedBy, unmatched, sale, saleByCampaign, totalOrders, unmatchedLines, unmatchedRevenue, productRows: productRows.length, orderCurrencies: [...new Set(orders.map((o) => o.currency))] };
}

async function platformSpend(ids: string[], range: { from: string; to: string }, campaignId: string | null) {
  if (!ids.length) return 0;
  const r = await db.adDailyMetric.aggregate({ where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to }, ...(campaignId ? { campaignId } : {}) }, _sum: { spend: true } });
  return r._sum.spend ?? 0;
}

export async function buildProductReport(userId: string, range: Range, f: Filter) {
  const prevRange = prevRangeOf(range);
  const L = await load(userId, range, f);
  const products = await catalog(userId, L.storeIds);
  const [cur, prev, spend, prevSpend] = await Promise.all([compute(userId, range, f, L, products), compute(userId, prevRange, f, L, products), platformSpend(L.ids, range, L.campaignId), platformSpend(L.ids, prevRange, L.campaignId)]);
  const conv = f.platform === "google";
  const productSynced = L.accounts.some((a) => a.productSyncedAt);
  const coverage = coverageOf(L.accounts, range), prevCoverage = coverageOf(L.accounts, prevRange);

  // Platform ortalamaları (yalnızca eşleşen ürünlerin platform verisi): eşik ve sınıflandırma bunlardan türetilir.
  const all = [...cur.ad.values()];
  const tot = all.reduce((a, x) => ({ spend: a.spend + (x.spend ?? 0), clicks: a.clicks + x.clicks, conv: a.conv + (x.conversions ?? 0), value: a.value + (x.value ?? 0), impressions: a.impressions + x.impressions }), { spend: 0, clicks: 0, conv: 0, value: 0, impressions: 0 });
  const saleOrders = [...cur.sale.values()].reduce((a, s) => a + s.orders.size, 0);
  // Meta'da ürün dönüşümü yok: başarı ölçüsü ikas UTM siparişleridir (kaynak etikette belirtilir).
  const succ = (k: string) => (conv ? cur.ad.get(k)?.conversions ?? 0 : cur.sale.get(k)?.orders.size ?? 0);
  const succTotal = conv ? tot.conv : saleOrders;
  const avgCvr = tot.clicks && succTotal ? succTotal / tot.clicks : null; // tıklama başına başarı
  const avgCpa = succTotal ? tot.spend / succTotal : null;
  const avgRoas = conv ? div(tot.value, tot.spend) : div([...cur.sale.values()].reduce((a, s) => a + s.revenue, 0), tot.spend);
  // Yeterli veri: ortalama dönüşüm oranıyla en az 3 başarı beklenen tıklama ya da en az 3 ortalama CPA kadar harcama.
  const minClicks = avgCvr ? Math.ceil(3 / avgCvr) : null;
  const minSpend = avgCpa ? Math.round(avgCpa * 3 * 100) / 100 : null;
  const thresholds = { minClicks, minSpend, avgCvr: avgCvr === null ? null : avgCvr * 100, avgCpa, avgRoas, basis: conv ? "Google Ads ürün dönüşümü" : "ikas UTM siparişi (Meta ürün dönüşümü vermez)" };

  const rowsAll = products
    .filter((p) => cur.ad.has(p.key) || cur.sale.has(p.key) || prev.ad.has(p.key) || prev.sale.has(p.key))
    .map((p) => {
      const a = cur.ad.get(p.key) ?? null, s = cur.sale.get(p.key), pa = prev.ad.get(p.key), ps = prev.sale.get(p.key);
      const hasAd = !!a && (a.impressions > 0 || (a.spend ?? 0) > 0);
      const revenue = s?.revenue ?? 0, qty = s?.qty ?? 0, orders = s?.orders.size ?? 0;
      const roas = !a || a.spend === null ? null : conv ? div(a.value, a.spend) : div(revenue, a.spend);
      const cpa = !a || a.spend === null ? null : conv ? div(a.spend, a.conversions) : div(a.spend, orders || null);
      const eligible = hasAd && ((minClicks !== null && a!.clicks >= minClicks) || (minSpend !== null && (a!.spend ?? 0) >= minSpend));
      const status: ProductStatus = !hasAd ? "reklamsiz" : !eligible ? "yetersiz" : succ(p.key) === 0 ? "satissiz" : roas !== null && avgRoas !== null && roas < avgRoas * 0.5 ? "dusuk" : roas !== null && avgRoas !== null && roas >= avgRoas ? "iyi" : "yetersiz";
      return {
        key: p.key, name: p.name, sku: p.skus[0] ?? null, skus: p.skus, barcode: p.barcodes[0] ?? null, image: p.image, category: p.category, price: p.price, stock: p.stock,
        matchedBy: [...(cur.matchedBy.get(p.key) ?? prev.matchedBy.get(p.key) ?? [])].map((b) => MATCH_LABEL[b]),
        spend: a?.spend ?? (productSynced ? 0 : null), impressions: a?.impressions ?? (productSynced ? 0 : null), clicks: a?.clicks ?? (productSynced ? 0 : null),
        conversions: conv ? a?.conversions ?? (productSynced ? 0 : null) : null, value: conv ? a?.value ?? (productSynced ? 0 : null) : null,
        ctr: a ? pct(a.clicks, a.impressions) : null, convRate: conv && a ? pct(a.conversions, a.clicks) : null,
        orders, qty, revenue, roas, cpa, status, eligible,
        prev: { spend: pa?.spend ?? null, revenue: ps?.revenue ?? 0, qty: ps?.qty ?? 0 },
      };
    });
  type R = (typeof rowsAll)[number];
  const q = f.q?.trim() ? norm(f.q) : null, skuQ = f.sku?.trim().toLowerCase() || null;
  const status = f.status && f.status in PRODUCT_STATUS ? (f.status as ProductStatus) : null;
  const category = f.category || null;
  const rows = rowsAll.filter((r) => (!q || norm(r.name).includes(q)) && (!skuQ || r.skus.some((s) => s.toLowerCase().includes(skuQ)) || r.barcode?.toLowerCase().includes(skuQ)) && (!status || r.status === status) && (!category || r.category === category));
  const sort = (f.sort && f.sort in PRODUCT_SORTS ? f.sort : "spend") as keyof typeof PRODUCT_SORTS;
  const val = (r: R): number | null => ({ spend: r.spend, revenue: r.revenue, roas: r.roas, qty: r.qty, cpa: r.cpa, ctr: r.ctr })[sort];
  rows.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return sort === "cpa" ? x - y : y - x;
  });

  // KPI'lar (filtrelenmiş ürünler üzerinden; toplam harcama platformun kampanya düzeyi toplamıdır).
  const sum = (list: R[], k: "revenue" | "qty") => list.reduce((a, r) => a + r[k], 0);
  const prevSum = (list: R[], k: "revenue" | "qty") => list.reduce((a, r) => a + r.prev[k], 0);
  const productSpend = rows.reduce((a, r) => a + (r.spend ?? 0), 0);
  const productValue = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const prevProductRows = rows.map((r) => prev.ad.get(r.key)).filter((x): x is Ad => !!x);
  const pSpend = prevProductRows.reduce((a, x) => a + (x.spend ?? 0), 0), pValue = prevProductRows.reduce((a, x) => a + (x.value ?? 0), 0);
  const missing = coverage.state === "none" || coverage.state === "missing";
  const kpi = {
    spend: missing ? null : spend, prevSpend: prevCoverage.state === "ok" || prevCoverage.state === "partial" ? prevSpend : null,
    qty: sum(rows, "qty"), prevQty: prevSum(rows, "qty"),
    revenue: sum(rows, "revenue"), prevRevenue: prevSum(rows, "revenue"),
    roas: conv ? div(productValue, productSpend) : null, prevRoas: conv ? div(pValue, pSpend) : null,
    sold: rows.filter((r) => r.qty > 0).length, prevSold: rows.filter((r) => r.prev.qty > 0).length,
    revPerSpend: missing ? null : div(sum(rows, "revenue"), spend), prevRevPerSpend: div(prevSum(rows, "revenue"), prevSpend),
  };
  const top = (k: (r: R) => number | null, filter: (r: R) => boolean = () => true, asc = false) =>
    rows.filter((r) => filter(r) && k(r) !== null && (asc || k(r)! > 0)).sort((a, b) => (asc ? k(a)! - k(b)! : k(b)! - k(a)!)).slice(0, 5);
  const groups = {
    revenue: top((r) => r.revenue), roas: top((r) => r.roas, (r) => r.eligible), qty: top((r) => r.qty), spend: top((r) => r.spend),
    nosale: rows.filter((r) => r.status === "satissiz").sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, 5),
    low: rows.filter((r) => r.status === "dusuk").sort((a, b) => (a.roas ?? 0) - (b.roas ?? 0)).slice(0, 5),
  };
  const currencies = [...new Set([...L.accounts.map((a) => a.currency).filter(Boolean), ...cur.orderCurrencies])] as string[];
  return {
    range, prevRange, platform: f.platform, coverage, productSynced, productErrors: L.accounts.filter((a) => a.productError).map((a) => `${a.name}: ${a.productError}`),
    demo: L.accounts.some((a) => a.integration.externalUserId.startsWith("demo-")),
    sites: L.sites.map((s) => ({ id: s.id, name: s.name })), site: L.site ? { id: L.site.id, name: L.site.name } : null,
    campaignOptions: L.campaigns.map((c) => ({ id: c.id, name: c.name, provider: f.platform })), campaignId: L.campaignId,
    categories: [...new Set(rowsAll.map((r) => r.category).filter((x): x is string => !!x))].sort(),
    applied: { q: f.q?.trim() || null, sku: f.sku?.trim() || null, status, category, sort },
    currency: currencies[0] ?? "TRY", mixedCurrency: currencies.length > 1, accounts: L.accounts.length, stores: L.storeIds.length,
    kpi, rows, groups, thresholds,
    unmatched: [...cur.unmatched.values()].map((u) => ({ ...u, campaigns: u.campaigns.size, candidate: u.candidate ? products.find((p) => p.key === u.candidate)?.name ?? null : null })).sort((a, b) => (b.ad.spend ?? 0) - (a.ad.spend ?? 0)),
    unmatchedSales: { lines: cur.unmatchedLines, revenue: cur.unmatchedRevenue },
    attributedOrders: cur.totalOrders.size,
  };
}
export type ProductReport = Awaited<ReturnType<typeof buildProductReport>>;

/** Ürün detayı: kimlik storeId~productId; ürün oturumdaki kullanıcının mağazasında değilse null. */
export async function buildProductDetail(userId: string, key: string, range: Range, platform: AdPlatform) {
  const [storeId, productId] = key.split("~");
  if (!storeId || !productId) return null;
  const store = await db.store.findFirst({ where: { id: storeId, userId }, select: { id: true, label: true } });
  if (!store) return null;
  const site = await db.website.findFirst({ where: { userId, storeId }, select: { id: true } });
  const prevRange = prevRangeOf(range);
  const L = await load(userId, range, { platform, siteId: site?.id ?? null });
  L.storeIds = [storeId];
  const products = await catalog(userId, [storeId]);
  const p = products.find((x) => x.productId === productId);
  if (!p) return null;
  const f = { platform, siteId: site?.id ?? null };
  const [cur, prev] = await Promise.all([compute(userId, range, f, L, products), compute(userId, prevRange, f, L, products)]);
  const conv = platform === "google";
  const a = cur.ad.get(p.key) ?? null, s = cur.sale.get(p.key);
  const campaignName = new Map(L.campaigns.map((c) => [c.id, c.name]));
  const adCamp = cur.adByCampaign.get(p.key) ?? new Map<string, Ad>();
  const saleCamp = cur.saleByCampaign.get(p.key) ?? new Map<string, Sale>();
  // Kampanya dağılımı: platform satırı + aynı adlı utm_campaign'in ikas satışları (ad birebir aynıysa; ayrı sütun).
  const names = new Set([...[...adCamp.keys()].map((id) => campaignName.get(id) ?? id)]);
  const campaigns = [...adCamp.entries()].map(([id, x]) => {
    const name = campaignName.get(id) ?? id, sl = saleCamp.get(name);
    return { id, name, spend: x.spend, impressions: x.impressions, clicks: x.clicks, conversions: x.conversions, value: x.value, platformRoas: conv ? div(x.value, x.spend) : null, utmOrders: sl?.orders.size ?? 0, utmRevenue: sl?.revenue ?? 0 };
  }).sort((x, y) => (y.spend ?? 0) - (x.spend ?? 0));
  const utmOnly = [...saleCamp.entries()].filter(([n]) => !names.has(n)).map(([name, x]) => ({ name, orders: x.orders.size, qty: x.qty, revenue: x.revenue }));
  return {
    product: { ...p, storeName: store.label }, platform, range, prevRange, conv, productSynced: L.accounts.some((x) => x.productSyncedAt),
    demo: L.accounts.some((x) => x.integration.externalUserId.startsWith("demo-")),
    currency: L.accounts.find((x) => x.currency)?.currency ?? cur.orderCurrencies[0] ?? "TRY",
    matchedBy: [...(cur.matchedBy.get(p.key) ?? [])].map((b) => MATCH_LABEL[b]),
    ad: a, prevAd: prev.ad.get(p.key) ?? null,
    sales: { orders: s?.orders.size ?? 0, qty: s?.qty ?? 0, revenue: s?.revenue ?? 0, avgPrice: s?.qty ? s.revenue / s.qty : null },
    prevSales: (() => { const x = prev.sale.get(p.key); return { orders: x?.orders.size ?? 0, qty: x?.qty ?? 0, revenue: x?.revenue ?? 0 }; })(),
    roas: a && a.spend !== null ? (conv ? div(a.value, a.spend) : div(s?.revenue ?? 0, a.spend)) : null,
    cpa: a && a.spend !== null ? (conv ? div(a.spend, a.conversions) : div(a.spend, s?.orders.size || null)) : null,
    campaigns, utmOnly,
  };
}

/**
 * Finans motoru için reklam gideri: platformun ürün kırılımıyla KESİN eşleşen harcama ürüne (mağaza + SKU listesi) yazılır;
 * kalan harcama (ürün kırılımı olmayan kampanyalar, eşleşmeyen anahtarlar) "ilişkilendirilemeyen" olarak para birimi başına döner.
 * Tahmini dağıtım yapılmaz. Toplam, kampanya düzeyi harcamadır (AdDailyMetric); Meta ve Google ayrı hesaplardır ama gider olarak ikisi de sayılır.
 */
export async function adSpendForFinance(userId: string, range: { from: string; to: string }, storeIds: string[]) {
  const accounts = await db.adAccount.findMany({ where: { selected: true, integration: { userId } }, select: { id: true, currency: true } });
  const withCur = accounts.filter((a) => a.currency);
  const ids = withCur.map((a) => a.id);
  if (!ids.length) return { known: false as const, attributed: [] as { currency: string; storeId: string; skus: string[]; amount: number }[], unattributed: new Map<string, number>(), skippedAccounts: accounts.length };
  const curOf = new Map(withCur.map((a) => [a.id, a.currency!]));
  const [totals, rows, products] = await Promise.all([
    db.adDailyMetric.groupBy({ by: ["adAccountId"], where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true } }),
    db.adProductDaily.groupBy({ by: ["adAccountId", "productKey", "productTitle"], where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true } }),
    catalog(userId, storeIds),
  ]);
  const match = matcher(products);
  const byProduct = new Map<string, number>(); // `${currency}|${productKey}` → kuruş
  const matchedOf = new Map<string, number>(); // hesap → eşleşen kuruş
  for (const r of rows) {
    const m = match(r.productKey, r.productTitle);
    const cents = Math.round((r._sum.spend ?? 0) * 100);
    if (m.product === null || !cents) continue;
    const k = `${curOf.get(r.adAccountId)}|${m.product}`;
    byProduct.set(k, (byProduct.get(k) ?? 0) + cents);
    matchedOf.set(r.adAccountId, (matchedOf.get(r.adAccountId) ?? 0) + cents);
  }
  const unattributed = new Map<string, number>();
  for (const t of totals) {
    // Ürün görünümünün toplamı kampanya raporundan büyük çıkarsa (platform farkı) eksi değer üretilmez.
    const rest = Math.max(0, Math.round((t._sum.spend ?? 0) * 100) - (matchedOf.get(t.adAccountId) ?? 0));
    const cur = curOf.get(t.adAccountId)!;
    unattributed.set(cur, (unattributed.get(cur) ?? 0) + rest / 100);
  }
  const pOf = new Map(products.map((p) => [p.key, p]));
  const attributed = [...byProduct.entries()].map(([k, cents]) => {
    const [currency, key] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
    const p = pOf.get(key)!;
    return { currency, storeId: p.storeId, skus: p.skus, amount: cents / 100 };
  });
  return { known: true as const, attributed, unattributed, skippedAccounts: accounts.length - withCur.length };
}
