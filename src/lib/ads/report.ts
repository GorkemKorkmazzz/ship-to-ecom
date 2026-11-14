// Site bazlı reklam raporu. Yalnızca kullanıcının raporlamaya dahil ettiği (selected) hesaplar sayılır.
// Bir reklam hesabı birden fazla siteye bağlı olabilir: site satırında tam görünür, genel toplamda bir kez sayılır.
// Oranlar toplamlardan hesaplanır (günlük oranların ortalaması alınmaz). Erişim günler arasında toplanamadığı için yoktur.
import { db } from "../db";

export type Totals = { spend: number; impressions: number; clicks: number; purchases: number; value: number };
export type Ratios = Totals & { ctr: number | null; cpc: number | null; cpm: number | null; roas: number | null };

const empty = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, value: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;
export function ratios(t: Totals): Ratios {
  return {
    spend: r2(t.spend), impressions: t.impressions, clicks: t.clicks, purchases: r2(t.purchases), value: r2(t.value),
    ctr: t.impressions ? (t.clicks / t.impressions) * 100 : null,
    cpc: t.clicks ? t.spend / t.clicks : null,
    cpm: t.impressions ? (t.spend / t.impressions) * 1000 : null,
    roas: t.spend ? t.value / t.spend : null,
  };
}
const add = (a: Totals, b: Totals) => {
  a.spend += b.spend; a.impressions += b.impressions; a.clicks += b.clicks; a.purchases += b.purchases; a.value += b.value;
};

/** YYYY-MM-DD aralığı; geçersizse son 30 gün. En fazla 366 gün. */
export function parseAdRange(gun?: string | null, from?: string | null, to?: string | null) {
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  const ok = (s?: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  if (ok(from) && ok(to) && from! <= to!) {
    const span = (Date.parse(to!) - Date.parse(from!)) / 86400000;
    if (span <= 366) return { from: from!, to: to!, days: span + 1, preset: null as number | null };
  }
  const n = [7, 30, 90].includes(Number(gun)) ? Number(gun) : 30;
  const now = new Date();
  return { from: day(new Date(now.getTime() - (n - 1) * 86400000)), to: day(now), days: n, preset: n };
}

export async function buildAdReport(userId: string, range: { from: string; to: string }, siteId?: string | null) {
  const sites = await db.website.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, domain: true, adAccounts: { select: { adAccountId: true } } } });
  const site = siteId ? sites.find((s) => s.id === siteId) ?? null : null;
  const accounts = await db.adAccount.findMany({
    where: { selected: true, integration: { userId }, ...(site ? { websites: { some: { websiteId: site.id } } } : {}) },
    select: { id: true, name: true, provider: true, externalId: true, currency: true, metricsSyncedAt: true, metricsError: true, integration: { select: { status: true } } },
  });
  const ids = accounts.map((a) => a.id);
  const rows = ids.length
    ? await db.adDailyMetric.groupBy({
        by: ["adAccountId"],
        where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to } },
        _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
      })
    : [];
  const byAccount = new Map<string, Totals>();
  for (const r of rows)
    byAccount.set(r.adAccountId, { spend: r._sum.spend ?? 0, impressions: r._sum.impressions ?? 0, clicks: r._sum.clicks ?? 0, purchases: r._sum.purchases ?? 0, value: r._sum.purchaseValue ?? 0 });

  const total = empty();
  const platform: Record<string, Totals> = { meta: empty(), google: empty() };
  for (const a of accounts) {
    const t = byAccount.get(a.id) ?? empty();
    add(total, t);
    add(platform[a.provider] ??= empty(), t);
  }
  // Site satırları (tüm siteler görünümünde): her site kendi hesaplarının toplamı.
  const bySite = site ? [] : sites.map((s) => {
    const t = empty();
    const mine = s.adAccounts.map((x) => x.adAccountId).filter((id) => ids.includes(id));
    for (const id of mine) add(t, byAccount.get(id) ?? empty());
    return { id: s.id, name: s.name, domain: s.domain, accounts: mine.length, ...ratios(t) };
  });
  const shared = sites.length > 1 && accounts.some((a) => sites.filter((s) => s.adAccounts.some((x) => x.adAccountId === a.id)).length > 1);
  const unassigned = site ? 0 : accounts.filter((a) => !sites.some((s) => s.adAccounts.some((x) => x.adAccountId === a.id))).length;
  const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))] as string[];

  return {
    range, sites: sites.map((s) => ({ id: s.id, name: s.name, domain: s.domain })), site: site ? { id: site.id, name: site.name, domain: site.domain } : null,
    currency: currencies[0] ?? "TRY", mixedCurrency: currencies.length > 1, shared, unassigned,
    total: ratios(total),
    platforms: (["meta", "google"] as const).map((p) => ({ provider: p, accounts: accounts.filter((a) => a.provider === p).length, ...ratios(platform[p]) })),
    bySite,
    accounts: accounts
      .map((a) => ({ id: a.id, name: a.name, provider: a.provider, externalId: a.externalId, currency: a.currency, syncedAt: a.metricsSyncedAt, error: a.metricsError, broken: a.integration.status !== "active", ...ratios(byAccount.get(a.id) ?? empty()) }))
      .sort((x, y) => y.spend - x.spend),
  };
}
export type AdReport = Awaited<ReturnType<typeof buildAdReport>>;

/** Seçili hesap kimlikleri (rapor ile aynı kapsam: kullanıcı, selected, isteğe bağlı site). */
async function scopeIds(userId: string, siteId?: string | null) {
  const site = siteId ? await db.website.findFirst({ where: { id: siteId, userId }, select: { id: true } }) : null;
  const accs = await db.adAccount.findMany({ where: { selected: true, integration: { userId }, ...(site ? { websites: { some: { websiteId: site.id } } } : {}) }, select: { id: true, provider: true } });
  return accs;
}

const dayList = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

/**
 * Dashboard verisi: günlük platform serileri (veri gelmeyen günler 0), önceki eş uzunluktaki dönemin toplamları
 * ve kampanya performans tablosu.
 */
export async function buildAdDashboard(userId: string, range: { from: string; to: string; days: number }, siteId?: string | null) {
  const accs = await scopeIds(userId, siteId);
  const ids = accs.map((a) => a.id);
  const providerOf = new Map(accs.map((a) => [a.id, a.provider]));
  const days = dayList(range.from, range.to);
  const prevTo = new Date(Date.parse(`${range.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(`${prevTo}T00:00:00Z`) - (days.length - 1) * 86400000).toISOString().slice(0, 10);

  const [daily, prev, camps] = ids.length
    ? await Promise.all([
        db.adDailyMetric.groupBy({ by: ["adAccountId", "date"], where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } }),
        db.adDailyMetric.aggregate({ where: { adAccountId: { in: ids }, date: { gte: prevFrom, lte: prevTo } }, _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true }, _count: true }),
        campaignSums(ids, range),
      ])
    : [[], null, []];

  type Series = { spend: number[]; value: number[]; clicks: number[]; impressions: number[]; purchases: number[] };
  const blank = (): Series => ({ spend: days.map(() => 0), value: days.map(() => 0), clicks: days.map(() => 0), impressions: days.map(() => 0), purchases: days.map(() => 0) });
  const series: Record<"meta" | "google", Series> = { meta: blank(), google: blank() };
  for (const r of daily) {
    const i = days.indexOf(r.date);
    const p = providerOf.get(r.adAccountId) as "meta" | "google" | undefined;
    if (i < 0 || !p || !series[p]) continue;
    series[p].spend[i] += r._sum.spend ?? 0;
    series[p].value[i] += r._sum.purchaseValue ?? 0;
    series[p].clicks[i] += r._sum.clicks ?? 0;
    series[p].impressions[i] += r._sum.impressions ?? 0;
    series[p].purchases[i] += r._sum.purchases ?? 0;
  }
  for (const s of Object.values(series)) for (const k of Object.keys(s) as (keyof Series)[]) s[k] = s[k].map((v) => Math.round(v * 100) / 100);

  const campaigns = await campaignRows(camps);

  const previous = prev && prev._count
    ? ratios({ spend: prev._sum.spend ?? 0, impressions: prev._sum.impressions ?? 0, clicks: prev._sum.clicks ?? 0, purchases: prev._sum.purchases ?? 0, value: prev._sum.purchaseValue ?? 0 })
    : null;
  return { days, series, previous, prevRange: { from: prevFrom, to: prevTo }, campaigns };
}

const campaignSums = (accountIds: string[], range: { from: string; to: string }, campaignIds?: string[]) =>
  db.adDailyMetric.groupBy({
    by: ["campaignId"],
    where: { adAccountId: { in: accountIds }, date: { gte: range.from, lte: range.to }, ...(campaignIds ? { campaignId: { in: campaignIds } } : {}) },
    _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
  });
type Sums = Awaited<ReturnType<typeof campaignSums>>;
const totalsOf = (s: Sums[number]["_sum"]): Totals => ({ spend: s.spend ?? 0, impressions: s.impressions ?? 0, clicks: s.clicks ?? 0, purchases: s.purchases ?? 0, value: s.purchaseValue ?? 0 });

/** Kampanya toplamlarını kampanya bilgileriyle birleştirir; harcamaya göre sıralar. */
async function campaignRows(sums: Sums) {
  const info = sums.length
    ? await db.adCampaign.findMany({ where: { id: { in: sums.map((c) => c.campaignId) } }, select: { id: true, name: true, status: true, objective: true, adAccount: { select: { id: true, name: true, provider: true } } } })
    : [];
  const infoOf = new Map(info.map((c) => [c.id, c]));
  return sums
    .map((c) => {
      const i = infoOf.get(c.campaignId);
      return { id: c.campaignId, name: i?.name ?? "—", status: i?.status ?? null, objective: i?.objective ?? null, account: i?.adAccount.name ?? "—", accountId: i?.adAccount.id ?? "", provider: i?.adAccount.provider ?? "meta", ...ratios(totalsOf(c._sum)) };
    })
    .sort((a, b) => b.spend - a.spend);
}
export type CampaignRow = Awaited<ReturnType<typeof campaignRows>>[number];

const SORTS = ["name", "spend", "clicks", "ctr", "cpc", "purchases", "value", "roas"] as const;
export type CampaignSort = (typeof SORTS)[number];

/**
 * Kampanya raporu: tüm kampanyalar, platform / durum / ad filtresi ve sıralama.
 * Her kampanyanın önceki eş dönem değerleri de döner (ROAS ve harcama değişimi için).
 */
export async function buildCampaignReport(
  userId: string,
  range: { from: string; to: string; days: number },
  siteId: string | null,
  opt: { provider?: string | null; status?: string | null; q?: string | null; sort?: string | null; dir?: string | null },
) {
  const accs = (await scopeIds(userId, siteId)).filter((a) => !opt.provider || a.provider === opt.provider);
  const ids = accs.map((a) => a.id);
  const prevTo = new Date(Date.parse(`${range.from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const prevFrom = new Date(Date.parse(`${prevTo}T00:00:00Z`) - (range.days - 1) * 86400000).toISOString().slice(0, 10);
  const [cur, prev] = ids.length ? await Promise.all([campaignSums(ids, range), campaignSums(ids, { from: prevFrom, to: prevTo })]) : [[], []];
  const prevOf = new Map(prev.map((p) => [p.campaignId, ratios(totalsOf(p._sum))]));
  let rows = (await campaignRows(cur)).map((c) => ({ ...c, prev: prevOf.get(c.id) ?? null }));
  const statuses = [...new Set(rows.map((r) => r.status).filter((x): x is string => !!x))].sort();
  if (opt.status) rows = rows.filter((r) => r.status === opt.status);
  const q = opt.q?.trim().toLocaleLowerCase("tr");
  if (q) rows = rows.filter((r) => r.name.toLocaleLowerCase("tr").includes(q) || r.account.toLocaleLowerCase("tr").includes(q));
  const sort: CampaignSort = (SORTS as readonly string[]).includes(opt.sort ?? "") ? (opt.sort as CampaignSort) : "spend";
  const dir = opt.dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "tr") * dir;
    const x = a[sort] ?? -Infinity, y = b[sort] ?? -Infinity; // oranı olmayanlar (null) her zaman sonda
    return x === y ? 0 : x > y ? dir : -dir;
  });
  return { rows, statuses, sort, dir: dir === 1 ? "asc" : "desc", prevRange: { from: prevFrom, to: prevTo } };
}

/** Tek kampanyanın günlük dökümü. Kampanya kullanıcının raporlamaya dahil ettiği bir hesaba ait değilse null. */
export async function buildCampaignDetail(userId: string, campaignId: string, range: { from: string; to: string; days: number }) {
  const c = await db.adCampaign.findFirst({
    where: { id: campaignId, adAccount: { integration: { userId } } },
    select: { id: true, name: true, status: true, objective: true, externalId: true, adAccount: { select: { id: true, name: true, provider: true, externalId: true, currency: true, selected: true, websites: { select: { website: { select: { id: true, name: true } } } } } } },
  });
  if (!c) return null;
  const rows = await db.adDailyMetric.findMany({ where: { campaignId: c.id, date: { gte: range.from, lte: range.to } }, orderBy: { date: "asc" }, select: { date: true, spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true } });
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const days = dayList(range.from, range.to).map((date) => {
    const r = byDate.get(date);
    return { date, ...ratios({ spend: r?.spend ?? 0, impressions: r?.impressions ?? 0, clicks: r?.clicks ?? 0, purchases: r?.purchases ?? 0, value: r?.purchaseValue ?? 0 }) };
  });
  const total = empty();
  for (const r of rows) add(total, { spend: r.spend, impressions: r.impressions, clicks: r.clicks, purchases: r.purchases, value: r.purchaseValue });
  return { campaign: c, days, total: ratios(total) };
}
