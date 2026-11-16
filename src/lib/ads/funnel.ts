// Reklam hunisi. Dört kaynak AYRI ayrı raporlanır ve hiçbir aşamada birbirine eklenmez:
//  meta   : Marketing API Insights (gösterim → bağlantı tıklaması → açılış sayfası → içerik → sepet → ödeme → satın alma), Meta atıf ayarıyla.
//  google : Google Ads (gösterim → tıklama → dönüşüm) + ayrı segment olarak GA4 (yalnızca sessionGoogleAdsCampaignName adı eşleşen kampanyalar).
//  ga4    : GA4 web sitesi (oturum → ürün görüntüleme → sepet → ödeme → satın alma), kaynak/ortam/kampanya kırılımlı.
//  ikas   : gerçek siparişler (UTM'li / UTM'siz), gerçek ciro. Platform dönüşümleri siparişlere eklenmez.
// Oranlar toplamlardan hesaplanır; aşama değeri null = veri yok / desteklenmiyor (0 ile karıştırılmaz).
import { db } from "../db";
import { coverageOf, prevRangeOf } from "./report";

export const FUNNEL_SOURCES = [["meta", "Meta"], ["google", "Google Ads"], ["ga4", "GA4 web sitesi"], ["ikas", "ikas siparişleri"]] as const;
export type FunnelSource = (typeof FUNNEL_SOURCES)[number][0];
/** Kural tabanlı yorum için önceki aşamada gereken asgari hacim. */
export const MIN_BASE = 100;

type Range = { from: string; to: string; days: number };
export type Stage = { key: string; label: string; value: number | null; prev: number | null; note?: string };
export type StageRow = Stage & { rate: number | null; drop: number | null; change: number | null };
type Opt = { source: FunnelSource; campaignId?: string | null; accountId?: string | null; traffic?: string | null };

const pct = (a: number | null, b: number | null) => (a === null || b === null || !b ? null : (a / b) * 100);
/** Aşama zinciri: her aşamanın bir öncekine göre dönüşümü ve kaybı, önceki döneme göre değişimi. */
export function chain(stages: Stage[]): StageRow[] {
  return stages.map((s, i) => {
    const before = i ? stages[i - 1].value : null;
    const rate = i ? pct(s.value, before) : null;
    return { ...s, rate, drop: rate === null ? null : 100 - rate, change: s.value === null || s.prev === null || !s.prev ? null : ((s.value - s.prev) / s.prev) * 100 };
  });
}
const sumOf = <T,>(rows: T[], f: (r: T) => number | null | undefined) => rows.reduce((a, r) => a + (f(r) ?? 0), 0);
const splitTraffic = (t?: string | null) => {
  const m = t?.split(" / ");
  return m && m.length === 2 ? { source: m[0], medium: m[1] } : null;
};

async function scope(userId: string, siteId: string | null | undefined) {
  const sites = await db.website.findMany({
    where: { userId }, orderBy: { createdAt: "asc" },
    select: { id: true, name: true, storeId: true, analytics: { select: { id: true, name: true, metricsSyncedAt: true, metricsError: true, currency: true, integration: { select: { externalUserId: true } } } } },
  });
  const site = siteId ? sites.find((s) => s.id === siteId) ?? null : null;
  return { sites, site, inScope: site ? [site] : sites };
}

async function adAccounts(userId: string, siteId: string | null, provider: string, accountId?: string | null) {
  const all = await db.adAccount.findMany({
    where: { selected: true, provider, integration: { userId }, ...(siteId ? { websites: { some: { websiteId: siteId } } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, currency: true, metricsFrom: true, metricsSyncedAt: true, integration: { select: { externalUserId: true } } },
  });
  const accounts = accountId ? all.filter((a) => a.id === accountId) : all;
  return { all, accounts };
}

async function metricRows(ids: string[], range: { from: string; to: string }, campaignId?: string | null) {
  if (!ids.length) return [];
  return db.adDailyMetric.findMany({
    where: { adAccountId: { in: ids }, date: { gte: range.from, lte: range.to }, ...(campaignId ? { campaignId } : {}) },
    select: { campaignId: true, impressions: true, clicks: true, purchases: true, purchaseValue: true, spend: true, linkClicks: true, landingPageViews: true, viewContent: true, addToCart: true, initiateCheckout: true },
  });
}

export async function buildFunnel(userId: string, range: Range, siteId: string | null, opt: Opt) {
  const prevRange = prevRangeOf(range);
  const { sites, site, inScope } = await scope(userId, siteId);
  const base = { range, prevRange, source: opt.source, sites: sites.map((s) => ({ id: s.id, name: s.name })), site: site ? { id: site.id, name: site.name } : null };

  if (opt.source === "meta" || opt.source === "google") {
    const provider = opt.source;
    const { all, accounts } = await adAccounts(userId, site?.id ?? null, provider, opt.accountId);
    const ids = accounts.map((a) => a.id);
    const campaigns = ids.length ? await db.adCampaign.findMany({ where: { adAccountId: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
    const campaignId = opt.campaignId && campaigns.some((c) => c.id === opt.campaignId) ? opt.campaignId : null;
    const [cur, prev] = await Promise.all([metricRows(ids, range, campaignId), metricRows(ids, prevRange, campaignId)]);
    const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))] as string[];
    const common = {
      ...base, coverage: coverageOf(accounts, range), prevCoverage: coverageOf(accounts, prevRange),
      accountOptions: all.map((a) => ({ id: a.id, name: a.name })), accountId: opt.accountId && all.some((a) => a.id === opt.accountId) ? opt.accountId : null,
      campaignOptions: campaigns, campaignId, currency: currencies[0] ?? "TRY", mixedCurrency: currencies.length > 1,
      demo: accounts.some((a) => a.integration.externalUserId.startsWith("demo-")),
      spend: sumOf(cur, (r) => r.spend), value: sumOf(cur, (r) => r.purchaseValue),
    };
    // Huni eylemleri bu özellikle eklenen senkronda yazılır; yeni senkron eylem sütunlarını her zaman doldurur (eylem yoksa 0).
    // landingPageViews null olan satır eski senkrondandır: o dönemin toplamı eksik olacağından "veri yok" denir.
    // Meta, sıfır olan inline_link_clicks alanını yanıttan çıkarabilir; yeni satırda null bağlantı tıklaması 0 sayılır.
    const field = (rows: typeof cur, k: "linkClicks" | "landingPageViews" | "viewContent" | "addToCart" | "initiateCheckout") =>
      !rows.length || rows.some((r) => r.landingPageViews === null) ? null : sumOf(rows, (r) => r[k]);
    const plain = (rows: typeof cur, k: "impressions" | "clicks" | "purchases") => (rows.length ? sumOf(rows, (r) => r[k]) : null);
    const has = (cov: { state: string }) => cov.state !== "none" && cov.state !== "missing";
    const v = (rows: typeof cur, cov: { state: string }, x: number | null) => (has(cov) ? x ?? (rows.length ? null : 0) : null);

    if (provider === "meta") {
      const st = (key: string, label: string, f: (rows: typeof cur) => number | null, note?: string): Stage => ({
        key, label, note, value: v(cur, common.coverage, f(cur)), prev: v(prev, common.prevCoverage, f(prev)),
      });
      const stages = chain([
        st("impressions", "Gösterim", (r) => plain(r, "impressions")),
        st("linkClicks", "Bağlantı tıklaması", (r) => field(r, "linkClicks"), "inline_link_clicks (tüm tıklamalar değil)"),
        st("landingPageViews", "Açılış sayfası görüntüleme", (r) => field(r, "landingPageViews"), "landing_page_view"),
        st("viewContent", "İçerik görüntüleme", (r) => field(r, "viewContent"), "omni_view_content, yoksa piksel view_content (ikisi toplanmaz)"),
        st("addToCart", "Sepete ekleme", (r) => field(r, "addToCart"), "omni_add_to_cart, yoksa piksel add_to_cart"),
        st("initiateCheckout", "Ödeme başlatma", (r) => field(r, "initiateCheckout"), "omni_initiated_checkout, yoksa piksel initiate_checkout"),
        st("purchases", "Satın alma", (r) => plain(r, "purchases"), "omni_purchase > piksel purchase > onsite purchase (tek tür)"),
      ]);
      const byCampaign = campaignRows(cur, campaigns, (r) => ({ visits: r.landingPageViews, carts: r.addToCart, purchases: r.purchases }));
      return { ...common, kind: "meta" as const, stages, segments: [] as { title: string; note: string; stages: StageRow[] }[], byCampaign, ga4: null, ikas: null, insights: insights(stages, byCampaign) };
    }

    // Google Ads aşamaları + GA4 eşleşen segment (ayrı zincir; iki zincir arasında oran hesaplanmaz).
    const st = (key: string, label: string, k: "impressions" | "clicks" | "purchases", note?: string): Stage => ({
      key, label, note, value: v(cur, common.coverage, plain(cur, k)), prev: v(prev, common.prevCoverage, plain(prev, k)),
    });
    const stages = chain([
      st("impressions", "Gösterim", "impressions"),
      st("clicks", "Tıklama", "clicks"),
      st("purchases", "Dönüşüm", "purchases", "Hesapta dönüşüme dahil tüm işlemler (yalnızca satın alma olmayabilir)"),
    ]);
    const names = (campaignId ? campaigns.filter((c) => c.id === campaignId) : campaigns).map((c) => c.name);
    const props = inScope.map((s) => s.analytics).filter((p): p is NonNullable<typeof p> => !!p);
    const ga4Rows = async (r: { from: string; to: string }) =>
      props.length && names.length
        ? db.analyticsCampaignDaily.findMany({ where: { propertyId: { in: props.map((p) => p.id) }, date: { gte: r.from, lte: r.to }, googleAdsCampaign: { in: names } } })
        : [];
    const [g, gp] = await Promise.all([ga4Rows(range), ga4Rows(prevRange)]);
    const synced = props.some((p) => p.metricsSyncedAt);
    const gv = (rows: typeof g, k: "sessions" | "itemViews" | "addToCarts" | "checkouts" | "purchases") => (synced ? sumOf(rows, (r) => r[k]) : null);
    const matched = new Set(g.map((r) => r.googleAdsCampaign));
    const segments = props.length
      ? [{
          title: "GA4: Google Ads kampanyalarından gelen oturumlar",
          note: `GA4 sessionGoogleAdsCampaignName değeri Google Ads kampanya adıyla birebir eşleşen satırlar (${matched.size}/${names.length} kampanya eşleşti). Google Ads dönüşümüyle toplanmaz.`,
          stages: chain([
            { key: "sessions", label: "Site oturumu", value: gv(g, "sessions"), prev: gv(gp, "sessions") },
            { key: "itemViews", label: "Ürün görüntüleme", value: gv(g, "itemViews"), prev: gv(gp, "itemViews"), note: "itemViewEvents (view_item)" },
            { key: "addToCarts", label: "Sepete ekleme", value: gv(g, "addToCarts"), prev: gv(gp, "addToCarts") },
            { key: "checkouts", label: "Ödeme başlatma", value: gv(g, "checkouts"), prev: gv(gp, "checkouts") },
            { key: "purchases", label: "Satın alma", value: gv(g, "purchases"), prev: gv(gp, "purchases") },
          ]),
        }]
      : [];
    const byCampaign = campaignRows(cur, campaigns, (r) => ({ visits: r.clicks, carts: null, purchases: r.purchases }));
    return { ...common, kind: "google" as const, stages, segments, byCampaign, ga4: null, ikas: null, insights: insights(stages, byCampaign), ga4Linked: props.length > 0 };
  }

  if (opt.source === "ga4") {
    const props = inScope.map((s) => s.analytics).filter((p): p is NonNullable<typeof p> => !!p);
    const pids = props.map((p) => p.id);
    const all = pids.length ? await db.analyticsCampaignDaily.findMany({ where: { propertyId: { in: pids }, date: { gte: prevRange.from, lte: range.to } } }) : [];
    const tf = splitTraffic(opt.traffic);
    const campaignOptions = [...new Set(all.map((r) => r.campaign))].sort().map((c) => ({ id: c, name: c }));
    const campaignId = opt.campaignId && campaignOptions.some((c) => c.id === opt.campaignId) ? opt.campaignId : null;
    const pick = (r: { from: string; to: string }) => all.filter((x) => x.date >= r.from && x.date <= r.to && (!tf || (x.source === tf.source && x.medium === tf.medium)) && (!campaignId || x.campaign === campaignId));
    const cur = pick(range), prev = pick(prevRange);
    const synced = props.some((p) => p.metricsSyncedAt);
    const syncDay = props.map((p) => p.metricsSyncedAt).filter(Boolean).sort().reverse()[0] ?? null;
    const coverage = !props.length ? { state: "none" as const, from: null, to: null } : coverageOf(props.map((p) => ({ metricsFrom: null, metricsSyncedAt: p.metricsSyncedAt })), range);
    // Senkron çalışmış ama huni tablosunda hiç satır yoksa (özellik önceki senkronda yoktu): veri yok, sıfır değil.
    const empty = synced && !all.length;
    const val = (rows: typeof cur, k: "sessions" | "itemViews" | "addToCarts" | "checkouts" | "purchases") => (!synced || empty ? null : sumOf(rows, (r) => r[k]));
    const stages = chain([
      { key: "sessions", label: "Site oturumu", value: val(cur, "sessions"), prev: val(prev, "sessions") },
      { key: "itemViews", label: "Ürün görüntüleme", value: val(cur, "itemViews"), prev: val(prev, "itemViews"), note: "itemViewEvents (view_item olayı)" },
      { key: "addToCarts", label: "Sepete ekleme", value: val(cur, "addToCarts"), prev: val(prev, "addToCarts") },
      { key: "checkouts", label: "Ödeme başlatma", value: val(cur, "checkouts"), prev: val(prev, "checkouts") },
      { key: "purchases", label: "Satın alma", value: val(cur, "purchases"), prev: val(prev, "purchases"), note: "ecommercePurchases" },
    ]);
    const group = (key: (r: (typeof cur)[number]) => string) => {
      const m = new Map<string, { name: string; sessions: number; itemViews: number; carts: number; checkouts: number; purchases: number; revenue: number }>();
      for (const r of cur) {
        const k = key(r);
        const g = m.get(k) ?? { name: k, sessions: 0, itemViews: 0, carts: 0, checkouts: 0, purchases: 0, revenue: 0 };
        g.sessions += r.sessions; g.itemViews += r.itemViews; g.carts += r.addToCarts; g.checkouts += r.checkouts; g.purchases += r.purchases; g.revenue += r.revenue;
        m.set(k, g);
      }
      return [...m.values()].map((g) => ({ ...g, convRate: pct(g.purchases, g.sessions) })).sort((a, b) => b.sessions - a.sessions);
    };
    const trafficOptions = [...new Set(all.map((r) => `${r.source} / ${r.medium}`))].sort();
    const bySource = group((r) => `${r.source} / ${r.medium}`);
    const byCampaignGa4 = group((r) => r.campaign);
    const currencies = [...new Set(props.map((p) => p.currency).filter(Boolean))] as string[];
    return {
      ...base, kind: "ga4" as const, coverage, prevCoverage: coverage, stages, segments: [], byCampaign: [], accountOptions: [], accountId: null, campaignOptions, campaignId,
      currency: currencies[0] ?? "TRY", mixedCurrency: currencies.length > 1, spend: 0, value: sumOf(cur, (r) => r.revenue),
      demo: props.some((p) => p.integration.externalUserId.startsWith("demo-")),
      ga4: { linked: props.length, empty, syncDay, trafficOptions, traffic: tf ? opt.traffic! : null, bySource, byCampaign: byCampaignGa4, errors: props.filter((p) => p.metricsError).map((p) => `${p.name}: ${p.metricsError}`) },
      ikas: null, insights: insights(stages, byCampaignGa4.map((c) => ({ name: c.name, visits: c.sessions, carts: c.carts, purchases: c.purchases }))),
    };
  }

  // ikas: gerçek siparişler (iptal/taslak hariç, panelden silinenler hariç). Platform dönüşümleri eklenmez.
  const storeIds = inScope.map((s) => s.storeId).filter((x): x is string => !!x);
  const orders = storeIds.length
    ? await db.order.findMany({
        where: { storeId: { in: storeIds }, store: { userId }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] }, orderedAt: { gte: new Date(`${prevRange.from}T00:00:00+03:00`), lte: new Date(`${range.to}T23:59:59.999+03:00`) } },
        select: { orderedAt: true, totalFinalPrice: true, currency: true, utmSource: true, utmMedium: true, utmCampaign: true, store: { select: { clientId: true } } },
      })
    : [];
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  const tf = splitTraffic(opt.traffic);
  const trafficOptions = [...new Set(orders.filter((o) => o.utmSource).map((o) => `${o.utmSource} / ${o.utmMedium ?? "(yok)"}`))].sort();
  const campaignOptions = [...new Set(orders.map((o) => o.utmCampaign).filter((x): x is string => !!x))].sort().map((c) => ({ id: c, name: c }));
  const campaignId = opt.campaignId && campaignOptions.some((c) => c.id === opt.campaignId) ? opt.campaignId : null;
  const pick = (r: { from: string; to: string }) =>
    orders.filter((o) => {
      const d = day(o.orderedAt!);
      return d >= r.from && d <= r.to && (!tf || (o.utmSource === tf.source && (o.utmMedium ?? "(yok)") === tf.medium)) && (!campaignId || o.utmCampaign === campaignId);
    });
  const cur = pick(range), prev = pick(prevRange);
  const currencies = [...new Set(cur.map((o) => o.currency))];
  const stat = (list: typeof cur) => ({ orders: list.length, revenue: sumOf(list, (o) => o.totalFinalPrice), aov: list.length ? sumOf(list, (o) => o.totalFinalPrice) / list.length : null });
  const utm = (list: typeof cur) => list.filter((o) => o.utmSource || o.utmCampaign);
  const noUtm = (list: typeof cur) => list.filter((o) => !o.utmSource && !o.utmCampaign);
  const m = new Map<string, typeof cur>();
  for (const o of utm(cur)) {
    const k = o.utmCampaign ?? "(kampanya yok)";
    m.set(k, [...(m.get(k) ?? []), o]);
  }
  const bySource = new Map<string, typeof cur>();
  for (const o of cur) {
    const k = o.utmSource ? `${o.utmSource} / ${o.utmMedium ?? "(yok)"}` : "UTM yok (eşleşmeyen)";
    bySource.set(k, [...(bySource.get(k) ?? []), o]);
  }
  return {
    ...base, kind: "ikas" as const, coverage: { state: storeIds.length ? ("ok" as const) : ("none" as const), from: null, to: null }, prevCoverage: null,
    stages: [] as StageRow[], segments: [], byCampaign: [], accountOptions: [], accountId: null, campaignOptions, campaignId,
    currency: currencies[0] ?? "TRY", mixedCurrency: currencies.length > 1, spend: 0, value: stat(cur).revenue,
    demo: orders.some((o) => o.store.clientId === "demo"),
    ga4: null,
    ikas: {
      stores: storeIds.length, trafficOptions, traffic: tf ? opt.traffic! : null,
      all: stat(cur), allPrev: stat(prev), utm: stat(utm(cur)), utmPrev: stat(utm(prev)), unmatched: stat(noUtm(cur)), unmatchedPrev: stat(noUtm(prev)),
      byCampaign: [...m.entries()].map(([name, list]) => ({ name, ...stat(list) })).sort((a, b) => b.revenue - a.revenue),
      bySource: [...bySource.entries()].map(([name, list]) => ({ name, ...stat(list) })).sort((a, b) => b.revenue - a.revenue),
    },
    insights: [] as string[],
  };
}
export type Funnel = Awaited<ReturnType<typeof buildFunnel>>;

type MRow = Awaited<ReturnType<typeof metricRows>>[number];
function campaignRows(rows: MRow[], campaigns: { id: string; name: string }[], f: (r: MRow) => { visits: number | null; carts: number | null; purchases: number }) {
  const m = new Map<string, { name: string; visits: number | null; carts: number | null; purchases: number; spend: number }>();
  for (const r of rows) {
    const x = f(r);
    const g = m.get(r.campaignId) ?? { name: campaigns.find((c) => c.id === r.campaignId)?.name ?? "?", visits: 0, carts: 0, purchases: 0, spend: 0 };
    // Bir gün bile eksikse (null) kampanya toplamı "veri yok" olur.
    g.visits = g.visits === null || x.visits === null ? null : g.visits + x.visits; // Meta: eski senkron satırı (null) → veri yok
    g.carts = g.carts === null || x.carts === null ? null : g.carts + x.carts;
    g.purchases += x.purchases; g.spend += r.spend;
    m.set(r.campaignId, g);
  }
  return [...m.values()].map((g) => ({ ...g, convRate: pct(g.purchases, g.visits) })).sort((a, b) => b.spend - a.spend);
}

/** Kural tabanlı yorumlar; yalnızca önceki aşama en az MIN_BASE hacme sahipse üretilir. */
function insights(stages: StageRow[], camps: { name: string; visits: number | null; carts: number | null; purchases: number }[]) {
  const out: string[] = [];
  const f = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
  const usable = stages.filter((s, i) => i > 0 && s.rate !== null && (stages[i - 1].value ?? 0) >= MIN_BASE);
  if (usable.length) {
    const worst = usable.reduce((a, b) => (b.drop! > a.drop! ? b : a));
    const i = stages.indexOf(worst);
    out.push(`En büyük kayıp ${stages[i - 1].label.toLowerCase()} → ${worst.label.toLowerCase()} adımında: %${f(worst.drop!)}.`);
  }
  for (const s of stages.slice(1)) {
    const i = stages.indexOf(s);
    const prevRate = pct(s.prev, stages[i - 1].prev);
    if (s.rate !== null && prevRate !== null && (stages[i - 1].prev ?? 0) >= MIN_BASE && (stages[i - 1].value ?? 0) >= MIN_BASE && Math.abs(s.rate - prevRate) >= 20 * (prevRate / 100) && Math.abs(s.rate - prevRate) >= 1)
      out.push(`${stages[i - 1].label} → ${s.label} dönüşümü önceki döneme göre ${s.rate > prevRate ? "yükseldi" : "düştü"}: %${f(prevRate)} → %${f(s.rate)}.`);
  }
  const big = camps.filter((c) => (c.visits ?? 0) >= MIN_BASE);
  if (big.length >= 2) {
    const rated = big.map((c) => ({ ...c, r: c.purchases / c.visits! }));
    const avg = rated.reduce((a, c) => a + c.purchases, 0) / rated.reduce((a, c) => a + c.visits!, 0);
    const low = rated.filter((c) => c.r < avg * 0.5).sort((a, b) => b.visits! - a.visits!)[0];
    if (low) out.push(`"${low.name}" çok ziyaret alıyor (${f(low.visits!)}) ama satın alma oranı ortalamanın yarısından düşük (%${f(low.r * 100)} / ort. %${f(avg * 100)}).`);
  }
  return out;
}
