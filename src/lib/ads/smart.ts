// Akıllı reklam analizi: mevcut rapor servislerinden (kampanya günlükleri, kreatif raporu, ürün raporu) veriyi toplar,
// kural motorunu (insight-engine) çalıştırır. Yalnızca okur; reklam hesaplarına hiçbir işlem göndermez.
import { db } from "../db";
import { buildCreativeReport } from "./creatives";
import { runEngine, type EntityInput, type Metrics } from "./insight-engine";
import type { AdPlatform } from "./platform";
import { buildProductReport } from "./products";
import { coverageOf, prevRangeOf } from "./report";

type Range = { from: string; to: string; days: number };
const shift = (ymd: string, d: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + d * 86400000).toISOString().slice(0, 10);
const empty = (): Metrics => ({ spend: 0, impressions: 0, clicks: 0, conversions: 0, value: 0 });
const addM = (a: Metrics, r: { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number }) => {
  a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.clicks; a.conversions += r.purchases; a.value += r.purchaseValue;
};

export async function buildSmartAnalysis(userId: string, range: Range, siteId: string | null, platform: AdPlatform) {
  const prev = prevRangeOf(range);
  const site = siteId ? await db.website.findFirst({ where: { id: siteId, userId }, select: { id: true, name: true } }) : null;
  const accounts = await db.adAccount.findMany({
    where: { selected: true, provider: platform, integration: { userId }, ...(site ? { websites: { some: { websiteId: site.id } } } : {}) },
    select: { id: true, currency: true, metricsFrom: true, metricsSyncedAt: true, productSyncedAt: true, levelSyncedAt: true, integration: { select: { externalUserId: true } } },
  });
  const ids = accounts.map((a) => a.id);
  const coverage = coverageOf(accounts, range), prevCoverage = coverageOf(accounts, prev);
  // Haftalık seri: dönemin son 3 tam 7 günlük dilimi (dönem en az 21 gün ise).
  const weeks = range.days >= 21 ? [2, 1, 0].map((k) => ({ from: shift(range.to, -7 * k - 6), to: shift(range.to, -7 * k) })) : [];
  const rows = ids.length
    ? await db.adDailyMetric.findMany({ where: { adAccountId: { in: ids }, date: { gte: prev.from, lte: range.to } }, select: { campaignId: true, date: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } })
    : [];
  const campaigns = ids.length ? await db.adCampaign.findMany({ where: { adAccountId: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(campaigns.map((c) => [c.id, c.name]));
  const total = empty(), prevTotal = empty();
  const cur = new Map<string, Metrics>(), old = new Map<string, Metrics>(), weekly = new Map<string, Metrics[]>();
  for (const r of rows) {
    if (r.date >= range.from) { addM(total, r); addM(cur.get(r.campaignId) ?? cur.set(r.campaignId, empty()).get(r.campaignId)!, r); }
    else if (r.date >= prev.from && r.date <= prev.to) { addM(prevTotal, r); addM(old.get(r.campaignId) ?? old.set(r.campaignId, empty()).get(r.campaignId)!, r); }
    weeks.forEach((w, i) => {
      if (r.date < w.from || r.date > w.to) return;
      const list = weekly.get(r.campaignId) ?? weekly.set(r.campaignId, weeks.map(empty)).get(r.campaignId)!;
      addM(list[i], r);
    });
  }
  const prevOk = prevCoverage.state === "ok"; // önceki dönem kısmen kapsanıyorsa karşılaştırma yanıltıcı olur
  const campaignInputs: EntityInput[] = [...cur.entries()].filter(([, m]) => m.spend > 0 || m.impressions > 0)
    .map(([id, m]) => ({ id, name: name.get(id) ?? id, cur: m, prev: prevOk ? old.get(id) ?? null : null, weekly: weekly.get(id) }))
    .sort((a, b) => b.cur.spend - a.cur.spend);

  const [creatives, products] = await Promise.all([
    buildCreativeReport(userId, range, { siteId: site?.id ?? null, provider: platform }),
    buildProductReport(userId, range, { siteId: site?.id ?? null, platform }),
  ]);
  const creativeInputs: EntityInput[] = creatives.rows.map((c) => ({
    id: c.id, name: c.name, cur: { spend: c.spend, impressions: c.impressions, clicks: c.clicks, conversions: c.purchases, value: c.value },
    prev: prevOk && c.prev ? { spend: c.prev.spend, impressions: c.prev.impressions, clicks: c.prev.clicks, conversions: c.prev.purchases, value: c.prev.value } : null,
  }));
  const missing = coverage.state === "none" || coverage.state === "missing";
  const result = missing ? null : runEngine({
    platform, currency: accounts.find((a) => a.currency)?.currency ?? "TRY", days: range.days,
    total, prevTotal: prevOk ? prevTotal : null, campaigns: campaignInputs, creatives: creativeInputs,
    products: products.rows.map((p) => ({ key: p.key, name: p.name, spend: p.spend, revenue: p.revenue, orders: p.orders, roas: p.roas, status: p.status, eligible: p.eligible })),
    productRoasBasis: platform === "google" ? "Google ürün dönüşüm değeri / ürün harcaması:" : "ikas UTM cirosu / Meta ürün harcaması:",
  });
  const synced = accounts.map((a) => a.metricsSyncedAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return {
    platform, range, prev, site, coverage, prevCoverage, accounts: accounts.length, lastSync: synced, analyzedAt: new Date(),
    demo: accounts.some((a) => a.integration.externalUserId.startsWith("demo-")),
    currency: accounts.find((a) => a.currency)?.currency ?? "TRY",
    result, creativeName: new Map(creatives.rows.map((c) => [c.id, c.name])), productSynced: products.productSynced,
  };
}
export type SmartAnalysis = Awaited<ReturnType<typeof buildSmartAnalysis>>;
