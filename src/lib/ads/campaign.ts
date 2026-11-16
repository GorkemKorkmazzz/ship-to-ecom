// Kampanya detay raporu: kampanya bilgisi ve bütçe, dönem/önceki dönem metrikleri, günlük seriler,
// reklam seti/reklam grubu ve reklam kırılımları. Kampanya düzeyi AdDailyMetric'ten, alt kırılımlar AdLevelDaily'den gelir (karıştırılmaz).
import { db } from "../db";
import { campaignReach, type ReachResult } from "./levels";
import { coverageOf, covered, prevRangeOf, ratios, type Totals } from "./report";

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });
const dayList = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};
type Row = { spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number };
const tot = (rows: Row[]): Totals => rows.reduce((a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, purchases: a.purchases + r.purchases, value: a.value + r.purchaseValue }), empty());
const withCpa = (t: Totals) => ({ ...ratios(t), cpa: t.purchases ? t.spend / t.purchases : null });

/** Kampanya kullanıcının bağlantılarından birine ait değilse null (başka kullanıcının kampanyası görünmez). */
export async function buildCampaignAnalysis(userId: string, campaignId: string, range: { from: string; to: string; days: number }) {
  const c = await db.adCampaign.findFirst({
    where: { id: campaignId, adAccount: { integration: { userId } } },
    include: {
      adAccount: { select: { id: true, name: true, provider: true, externalId: true, currency: true, timezone: true, selected: true, metricsFrom: true, metricsSyncedAt: true, metricsError: true, levelSyncedAt: true, levelError: true, integration: { select: { externalUserId: true, status: true } }, websites: { select: { website: { select: { id: true, name: true } } } } } },
      adSets: { orderBy: { name: "asc" } },
      ads: { orderBy: { name: "asc" }, include: { adSet: { select: { name: true } } } },
    },
  });
  if (!c) return null;
  const provider = c.adAccount.provider === "google" ? "google" : "meta";
  const prev = prevRangeOf(range);
  const cov = coverageOf([c.adAccount], range), prevCov = coverageOf([c.adAccount], prev);

  const [cur, old, lifetimeAgg, setDaily, adDaily, reach] = await Promise.all([
    db.adDailyMetric.findMany({ where: { campaignId: c.id, date: { gte: range.from, lte: range.to } }, select: { date: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
    db.adDailyMetric.findMany({ where: { campaignId: c.id, date: { gte: prev.from, lte: prev.to } }, select: { date: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
    db.adDailyMetric.aggregate({ where: { campaignId: c.id }, _sum: { spend: true }, _min: { date: true } }),
    db.adLevelDaily.groupBy({ by: ["entityId", "date"], where: { level: "adset", adSet: { campaignId: c.id }, date: { gte: prev.from, lte: range.to } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
    db.adLevelDaily.groupBy({ by: ["entityId", "date"], where: { level: "ad", ad: { campaignId: c.id }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
    campaignReach(c.id, userId, range.from, range.to),
  ]);

  // Günlük seriler: kapsam dışı günler null ("veri yok"), kapsam içinde satırı olmayan gün 0 (platform o gün gösterim yapmadı).
  const curDays = dayList(range.from, range.to), prevDays = dayList(prev.from, prev.to);
  const series = (days: string[], rows: typeof cur, cv: typeof cov) => {
    const by = new Map(rows.map((r) => [r.date, r]));
    return days.map((date) => {
      if (cv.state === "none" || cv.state === "missing" || !covered(cv, date)) return { date, covered: false, spend: null, purchases: null, value: null, roas: null, impressions: null, clicks: null };
      const r = by.get(date);
      const spend = r?.spend ?? 0, value = r?.purchaseValue ?? 0;
      return { date, covered: true, spend, purchases: r?.purchases ?? 0, value, roas: spend ? value / spend : null, impressions: r?.impressions ?? 0, clicks: r?.clicks ?? 0 };
    });
  };
  const daily = series(curDays, cur, cov), prevDaily = series(prevDays, old, prevCov);

  const flat = (g: typeof setDaily[number]): Row & { date: string } => ({ date: g.date, spend: g._sum.spend ?? 0, impressions: g._sum.impressions ?? 0, clicks: g._sum.clicks ?? 0, purchases: g._sum.purchases ?? 0, purchaseValue: g._sum.purchaseValue ?? 0 });
  const inRange = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
  const reachOf = (m: ReachResult["adsets"], id: string) => (provider === "google" ? { state: "unsupported" as const } : m.has(id) ? { state: "ok" as const, ...m.get(id)! } : { state: "missing" as const });
  const adsets = c.adSets.map((s) => {
    const rows = setDaily.filter((g) => g.entityId === s.id).map(flat);
    return { id: s.id, externalId: s.externalId, name: s.name, status: s.status, kind: s.kind, dailyBudget: s.dailyBudget, lifetimeBudget: s.lifetimeBudget, optimization: s.optimization, reach: reachOf(reach.adsets, s.id), ...withCpa(tot(rows.filter((r) => inRange(r.date, range)))), prev: withCpa(tot(rows.filter((r) => inRange(r.date, prev)))) };
  }).sort((a, b) => b.spend - a.spend);
  const ads = c.ads.map((a) => {
    const rows = adDaily.filter((g) => g.entityId === a.id).map(flat);
    return { id: a.id, externalId: a.externalId, name: a.name, status: a.status, adType: a.adType, adSet: a.adSet.name, reach: reachOf(reach.ads, a.id), ...withCpa(tot(rows)) };
  }).sort((a, b) => b.spend - a.spend);

  // Bütçe. Kampanya bütçesi varsa o; Meta'da bütçe reklam seti düzeyindeyse etkin reklam setlerinin bütçe toplamı.
  const activeSets = c.adSets.filter((s) => !s.status || /ACTIVE|ENABLED/.test(s.status));
  const setDailySum = activeSets.reduce((a, s) => a + (s.dailyBudget ?? 0), 0), setLifeSum = activeSets.reduce((a, s) => a + (s.lifetimeBudget ?? 0), 0);
  const dailyBudget = c.dailyBudget ?? (c.budgetLevel === "adset" && setDailySum ? setDailySum : null);
  const lifetimeBudget = c.lifetimeBudget ?? (c.budgetLevel === "adset" && setLifeSum ? setLifeSum : null);
  const total = withCpa(tot(cur));
  const lifetimeSpend = lifetimeAgg._sum.spend ?? 0;
  const budget = {
    level: c.budgetLevel, // campaign | adset | null (henüz senkronlanmadı)
    source: c.dailyBudget || c.lifetimeBudget ? "campaign" : c.budgetLevel === "adset" ? "adsets" : null,
    daily: dailyBudget, lifetime: lifetimeBudget,
    // Günlük bütçe kullanımı: dönem harcaması / (günlük bütçe × gün). Bütçe bugünkü değerdir; geçmişte değişmişse oran yaklaşık olur.
    dailyUsage: dailyBudget && cov.state !== "missing" ? total.spend / (dailyBudget * range.days) : null,
    // Ömür boyu bütçe kullanımı: senkronla kapsanan tüm harcama / ömür boyu bütçe. Kampanya senkron başlangıcından önce başladıysa eksik kalır.
    lifetimeSpend, lifetimeSince: lifetimeAgg._min.date, lifetimeUsage: lifetimeBudget ? lifetimeSpend / lifetimeBudget : null,
  };

  return {
    campaign: { id: c.id, name: c.name, externalId: c.externalId, status: c.status, objective: c.objective, provider, account: c.adAccount, websites: c.adAccount.websites.map((w) => w.website) },
    coverage: cov, prevCoverage: prevCov, prevRange: prev,
    total, prev: prevCov.state === "missing" || prevCov.state === "none" ? null : withCpa(tot(old)),
    reach: provider === "google" ? { state: "unsupported" as const } : reach.campaign ? { state: "ok" as const, ...reach.campaign, fetchedAt: reach.fetchedAt } : { state: reach.state === "error" ? ("error" as const) : ("missing" as const), error: reach.error },
    daily, prevDaily, budget, adsets, ads,
    levels: { syncedAt: c.adAccount.levelSyncedAt, error: c.adAccount.levelError },
    demo: c.adAccount.integration.externalUserId.startsWith("demo-"),
  };
}
export type CampaignAnalysis = NonNullable<Awaited<ReturnType<typeof buildCampaignAnalysis>>>;
