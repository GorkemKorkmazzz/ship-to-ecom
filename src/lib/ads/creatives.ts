// Reklam kreatifi analizi: reklam (Ad) düzeyi metrikler (AdLevelDaily level=ad) ve kreatif bilgisi (Ad.creative*).
// Oranlar toplam pay / toplam payda ile hesaplanır (CTR = Σtıklama / Σgösterim, CPA = Σharcama / Σdönüşüm …); aritmetik ortalama alınmaz.
import { db } from "../db";
import { coverageOf, prevRangeOf, ratios, type Totals } from "./report";

export const CREATIVE_TYPES: Record<string, string> = {
  IMAGE: "Görsel", VIDEO: "Video", CAROUSEL: "Carousel", DYNAMIC: "Dinamik kreatif", TEXT: "Metin (arama)", DISPLAY: "Duyarlı görüntülü", OTHER: "Diğer",
};
export const SORTS = { spend: "Harcama", roas: "ROAS", cpa: "CPA (düşük önce)", ctr: "CTR", purchases: "Dönüşüm", value: "Dönüşüm değeri" } as const;
export type CreativeSort = keyof typeof SORTS;

// "Yeterli veri" eşiği: az gösterim/harcama alan reklam en iyi ya da başarısız olarak sınıflandırılmaz.
export const MIN_IMPRESSIONS = 1000;
const minSpend = (total: number) => Math.max(50, total * 0.02);

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });
const withCpa = (t: Totals) => ({ ...ratios(t), cpa: t.purchases ? t.spend / t.purchases : null });
type Agg = ReturnType<typeof withCpa>;

export type CreativeFilter = { siteId?: string | null; provider?: string | null; campaignId?: string | null; adSetId?: string | null; type?: string | null; sort?: string | null };

/** Kapsamdaki reklam hesapları (kullanıcı, raporlamaya dahil, isteğe bağlı site ve platform). */
async function scope(userId: string, f: CreativeFilter) {
  const site = f.siteId ? await db.website.findFirst({ where: { id: f.siteId, userId }, select: { id: true } }) : null;
  return db.adAccount.findMany({
    where: { selected: true, integration: { userId }, ...(site ? { websites: { some: { websiteId: site.id } } } : {}), ...(f.provider ? { provider: f.provider } : {}) },
    select: { id: true, provider: true, currency: true, metricsFrom: true, metricsSyncedAt: true, levelSyncedAt: true, integration: { select: { externalUserId: true } } },
  });
}

const sumRows = (rows: { _sum: { spend: number | null; impressions: number | null; clicks: number | null; purchases: number | null; purchaseValue: number | null } }[]) =>
  rows.reduce((a, r) => ({ spend: a.spend + (r._sum.spend ?? 0), impressions: a.impressions + (r._sum.impressions ?? 0), clicks: a.clicks + (r._sum.clicks ?? 0), purchases: a.purchases + (r._sum.purchases ?? 0), value: a.value + (r._sum.purchaseValue ?? 0) }), empty());

export async function buildCreativeReport(userId: string, range: { from: string; to: string; days: number }, f: CreativeFilter) {
  const accounts = await scope(userId, f);
  const ids = accounts.map((a) => a.id);
  const demoIds = new Set(accounts.filter((a) => a.integration.externalUserId.startsWith("demo-")).map((a) => a.id));
  const prev = prevRangeOf(range);
  // Filtre seçenekleri (kullanıcının kendi kampanyaları/reklam setleri; başka kimlikler yok sayılır).
  const [campaigns, adSets] = ids.length ? await Promise.all([
    db.adCampaign.findMany({ where: { adAccountId: { in: ids }, ads: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true, adAccount: { select: { provider: true } } } }),
    db.adSet.findMany({ where: { adAccountId: { in: ids }, ...(f.campaignId ? { campaignId: f.campaignId } : {}), ads: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]) : [[], []];
  const campaignId = f.campaignId && campaigns.some((c) => c.id === f.campaignId) ? f.campaignId : null;
  const adSetId = f.adSetId && adSets.some((s) => s.id === f.adSetId) ? f.adSetId : null;
  const type = f.type && CREATIVE_TYPES[f.type] ? f.type : null;

  const ads = ids.length ? await db.ad.findMany({
    where: { adAccountId: { in: ids }, ...(campaignId ? { campaignId } : {}), ...(adSetId ? { adSetId } : {}), ...(type ? { creativeType: type } : {}) },
    include: { campaign: { select: { id: true, name: true } }, adSet: { select: { id: true, name: true, kind: true } }, adAccount: { select: { provider: true, currency: true } } },
  }) : [];
  const adIds = ads.map((a) => a.id);
  const [cur, old] = adIds.length ? await Promise.all([
    db.adLevelDaily.groupBy({ by: ["entityId"], where: { level: "ad", entityId: { in: adIds }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
    db.adLevelDaily.groupBy({ by: ["entityId"], where: { level: "ad", entityId: { in: adIds }, date: { gte: prev.from, lte: prev.to } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
  ]) : [[], []];
  const curOf = new Map(cur.map((r) => [r.entityId, sumRows([r])])), oldOf = new Map(old.map((r) => [r.entityId, sumRows([r])]));

  // Yalnızca dönemde gösterimi olan reklamlar listelenir.
  const rows = ads.filter((a) => (curOf.get(a.id)?.impressions ?? 0) > 0 || (curOf.get(a.id)?.spend ?? 0) > 0).map((a) => {
    const m = withCpa(curOf.get(a.id) ?? empty()), p = oldOf.get(a.id);
    let assets: { fieldType: string | null; label: string | null; type: string | null; url: string | null; videoId: string | null; text: string | null }[] = [];
    try { assets = a.assets ? JSON.parse(a.assets) : []; } catch {}
    return {
      id: a.id, externalId: a.externalId, name: a.name, status: a.status, provider: a.adAccount.provider, currency: a.adAccount.currency ?? "TRY",
      campaign: a.campaign, adSet: a.adSet, creativeType: a.creativeType, objectType: a.objectType, adType: a.adType,
      thumbnailUrl: a.thumbnailUrl ?? a.imageUrl, videoId: a.videoId, assets, creativeSyncedAt: a.creativeSyncedAt, demo: demoIds.has(a.adAccountId),
      ...m, prev: p ? withCpa(p) : null,
    };
  });

  const sumOf = (list: typeof rows) => withCpa(list.reduce((a, r) => ({ spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, purchases: a.purchases + r.purchases, value: a.value + r.value }), empty()));
  const total = sumOf(rows);
  // Yorumların karşılaştırma tabanı platform içidir: Meta ve Google dönüşüm tanımları/atıf modelleri farklı olduğu için birbirine katılmaz.
  const byProvider = Object.fromEntries(["meta", "google"].map((p) => [p, sumOf(rows.filter((r) => r.provider === p))])) as Record<string, Agg>;
  const threshold = minSpend(total.spend);
  const eligible = (r: (typeof rows)[number]) => r.impressions >= MIN_IMPRESSIONS && r.spend >= threshold;
  const ok = rows.filter(eligible);
  const top = (list: typeof rows, key: (r: (typeof rows)[number]) => number | null, dir: 1 | -1) => list.filter((r) => key(r) !== null).sort((a, b) => (key(a)! - key(b)!) * dir).slice(0, 4);
  // "Düşük performans": yeterli veriye sahip ve ROAS hesap ROAS'ının yarısının altında ya da harcamasına rağmen dönüşümü yok.
  const low = ok.filter((r) => (r.purchases === 0) || (total.roas !== null && r.roas !== null && r.roas < total.roas * 0.5)).sort((a, b) => b.spend - a.spend).slice(0, 4);
  const groups = {
    best: top(ok.filter((r) => r.purchases > 0), (r) => (r.roas ?? 0) * Math.log10(10 + r.purchases), -1), // ROAS'ı dönüşüm hacmiyle tartar
    roas: top(ok, (r) => r.roas, -1),
    cpa: top(ok.filter((r) => r.purchases > 0), (r) => r.cpa, 1),
    ctr: top(ok, (r) => r.ctr, -1),
    spend: top(rows, (r) => r.spend, -1),
    low,
  };

  const sort = (f.sort && f.sort in SORTS ? f.sort : "spend") as CreativeSort;
  const sorted = [...rows].sort((a, b) => {
    if (sort === "cpa") return (a.cpa ?? Infinity) - (b.cpa ?? Infinity);
    return ((b[sort] as number | null) ?? -Infinity) - ((a[sort] as number | null) ?? -Infinity);
  });

  return {
    range, prevRange: prev, rows: sorted, total, byProvider, count: rows.length, groups, threshold, sort,
    coverage: coverageOf(accounts, range), levelSynced: accounts.some((a) => a.levelSyncedAt),
    currency: accounts[0]?.currency ?? "TRY", mixedCurrency: new Set(accounts.map((a) => a.currency)).size > 1,
    demo: demoIds.size > 0, providers: [...new Set(accounts.map((a) => a.provider))],
    options: { campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, provider: c.adAccount.provider })), adSets: adSets.map((s) => ({ id: s.id, name: s.name, kind: s.kind })) },
    applied: { campaignId, adSetId, type },
  };
}
export type CreativeRow = Awaited<ReturnType<typeof buildCreativeReport>>["rows"][number];

/**
 * Kural tabanlı, açıklanabilir yorumlar. Yeterli veri yoksa (eşik altı) yorum üretilmez.
 * Karşılaştırma tabanı: kapsamdaki tüm kreatiflerin toplamından hesaplanan oranlar.
 */
export function creativeInsights(r: { impressions: number; spend: number; clicks: number; purchases: number; ctr: number | null; cpc: number | null; roas: number | null; cpa: number | null; prev: Agg | null }, base: Agg, threshold: number, rankRoas?: { rank: number; of: number }) {
  const out: { tone: "good" | "bad" | "info"; text: string }[] = [];
  if (r.impressions < MIN_IMPRESSIONS || r.spend < threshold) return out;
  const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100);
  if (r.ctr !== null && base.ctr) {
    if (r.ctr >= base.ctr * 1.2) out.push({ tone: "good", text: `CTR (%${r.ctr.toFixed(2)}) platform kreatif ortalamasının (%${base.ctr.toFixed(2)}) %${pct(r.ctr, base.ctr)} üzerinde.` });
    else if (r.ctr <= base.ctr * 0.7) out.push({ tone: "bad", text: `CTR (%${r.ctr.toFixed(2)}) platform kreatif ortalamasının (%${base.ctr.toFixed(2)}) %${Math.abs(pct(r.ctr, base.ctr))} altında.` });
  }
  if (base.spend && r.spend >= base.spend * 0.15 && base.roas !== null && (r.purchases === 0 || (r.roas !== null && r.roas < base.roas * 0.5)))
    out.push({ tone: "bad", text: `Toplam harcamanın %${Math.round((r.spend / base.spend) * 100)}'ini yapmasına rağmen ${r.purchases === 0 ? "dönüşüm sağlamamış" : `ROAS'ı (${r.roas!.toFixed(2)}) ortalamanın (${base.roas.toFixed(2)}) yarısının altında`}.` });
  if (rankRoas && rankRoas.of >= 3 && rankRoas.rank === 1 && r.roas !== null) out.push({ tone: "good", text: `Yeterli veriye sahip ${rankRoas.of} kreatif arasında en yüksek ROAS bu kreatifte (${r.roas.toFixed(2)}).` });
  if (r.cpa !== null && base.cpa && r.cpa <= base.cpa * 0.75) out.push({ tone: "good", text: `Dönüşüm maliyeti (CPA) ortalamanın %${Math.abs(pct(r.cpa, base.cpa))} altında.` });
  const p = r.prev;
  if (p && p.impressions >= MIN_IMPRESSIONS) {
    if (r.cpc !== null && p.cpc && pct(r.cpc, p.cpc) >= 20) out.push({ tone: "bad", text: `CPC önceki döneme göre %${pct(r.cpc, p.cpc)} yükselmiş.` });
    if (r.ctr !== null && p.ctr && pct(r.ctr, p.ctr) <= -20) out.push({ tone: "bad", text: `CTR önceki döneme göre %${Math.abs(pct(r.ctr, p.ctr))} düşmüş (kreatif yorgunluğu olabilir).` });
    if (r.roas !== null && p.roas && pct(r.roas, p.roas) >= 20) out.push({ tone: "good", text: `ROAS önceki döneme göre %${pct(r.roas, p.roas)} artmış.` });
  }
  return out;
}

/** Tek kreatifin detayı: günlük seriler (seçili + önceki dönem), reklam/kampanya bilgisi. Başka kullanıcının reklamıysa null. */
export async function buildCreativeDetail(userId: string, adId: string, range: { from: string; to: string; days: number }) {
  const a = await db.ad.findFirst({
    where: { id: adId, adAccount: { integration: { userId } } },
    include: { campaign: { select: { id: true, name: true, status: true, objective: true } }, adSet: { select: { id: true, name: true, kind: true, status: true } }, adAccount: { select: { id: true, name: true, provider: true, currency: true, metricsFrom: true, metricsSyncedAt: true, levelSyncedAt: true, integration: { select: { externalUserId: true } } } } },
  });
  if (!a) return null;
  const prev = prevRangeOf(range);
  const rows = await db.adLevelDaily.findMany({ where: { level: "ad", entityId: a.id, date: { gte: prev.from, lte: range.to } }, orderBy: { date: "asc" } });
  const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  const cov = coverageOf([a.adAccount], range), pcov = coverageOf([a.adAccount], prev);
  const series = (list: string[], cv: typeof cov) => list.map((d) => {
    const inCov = cv.state !== "none" && cv.state !== "missing" && (!cv.from || d >= cv.from) && (!cv.to || d <= cv.to);
    const r = rows.find((x) => x.date === d);
    if (!inCov) return { date: d, covered: false, spend: null, ctr: null, purchases: null, roas: null, cpc: null };
    const spend = r?.spend ?? 0, imp = r?.impressions ?? 0, clicks = r?.clicks ?? 0, val = r?.purchaseValue ?? 0;
    return { date: d, covered: true, spend, ctr: imp ? (clicks / imp) * 100 : null, purchases: r?.purchases ?? 0, roas: spend ? val / spend : null, cpc: clicks ? spend / clicks : null };
  });
  const tot = (from: string, to: string) => withCpa(rows.filter((r) => r.date >= from && r.date <= to).reduce((t, r) => ({ spend: t.spend + r.spend, impressions: t.impressions + r.impressions, clicks: t.clicks + r.clicks, purchases: t.purchases + r.purchases, value: t.value + r.purchaseValue }), empty()));
  let assets: { fieldType: string | null; label: string | null; type: string | null; url: string | null; videoId: string | null; text: string | null }[] = [];
  try { assets = a.assets ? JSON.parse(a.assets) : []; } catch {}
  return {
    ad: { id: a.id, externalId: a.externalId, name: a.name, status: a.status, creativeType: a.creativeType, objectType: a.objectType, adType: a.adType, creativeId: a.creativeId, thumbnailUrl: a.thumbnailUrl ?? a.imageUrl, imageUrl: a.imageUrl, videoId: a.videoId, assets, creativeSyncedAt: a.creativeSyncedAt },
    campaign: a.campaign, adSet: a.adSet, account: a.adAccount, provider: a.adAccount.provider, demo: a.adAccount.integration.externalUserId.startsWith("demo-"),
    total: tot(range.from, range.to), prev: pcov.state === "missing" || pcov.state === "none" ? null : tot(prev.from, prev.to), prevRange: prev, coverage: cov,
    daily: series(days(range.from, range.days), cov), prevDaily: series(days(prev.from, range.days), pcov),
  };
}
