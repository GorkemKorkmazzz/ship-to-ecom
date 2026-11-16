// Reklam seti / reklam grubu ve reklam düzeyi senkronu, bütçeler ve dönem erişimi.
// Kampanya düzeyi senkronu (meta.ts, google.ts) bittikten sonra aynı 30 dakikalık kuralla çalışır; hata verirse kampanya verisi etkilenmez.
// Belgeyle doğrulananlar:
//  - Meta: /act_{id}/adsets (id, name, campaign_id, effective_status, daily_budget, lifetime_budget, optimization_goal),
//    /act_{id}/ads (id, name, adset_id, campaign_id, effective_status), insights level=adset|ad.
//    Bütçeler hesap para biriminin en küçük biriminde gelir ("minimum denomination", ör. USD için cent).
//    Dönem erişimi: insights time_range ile, time_increment olmadan (tek satır, tekilleştirilmiş).
//  - Google Ads v26: FROM ad_group / FROM ad_group_ad (segments.date ile), bütçe: campaign_budget.amount_micros (günlük),
//    total_amount_micros (CUSTOM_PERIOD, ömür boyu). Bütçe alanları metriklerle aynı sorguda seçilemez; ayrı sorgulanır.
import type { AdAccount, AdIntegration } from "@prisma/client";
import { db } from "../db";
import { search } from "./google";
import { graph, purchaseOf } from "./meta";

type Acc = AdAccount & { integration: AdIntegration };
const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
// Meta bütçeleri hesap para biriminin en küçük biriminde gelir ("minimum denomination", ör. USD için cent).
// Sabit 100'e bölünmez. Öncelik Meta'nın "Currency codes" tablosundaki offset değeridir
// (https://developers.facebook.com/documentation/ads-commerce/marketing-api/currencies.md). Tablodan doğrulananlar:
//   offset 100: TRY, USD, EUR, GBP · offset 1: JPY, KRW, HUF, TWD, CLP, ISK, IDR, VND
// Tabloda doğrulanmamış para birimlerinde ISO/CLDR ondalık sayısı (Intl) kullanılır; para birimi tanınmıyorsa bütçe tahmin edilmez (null).
const META_OFFSET: Record<string, number> = { TRY: 100, USD: 100, EUR: 100, GBP: 100, JPY: 1, KRW: 1, HUF: 1, TWD: 1, CLP: 1, ISK: 1, IDR: 1, VND: 1 };
const SUPPORTED = (() => {
  try {
    return new Set((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency"));
  } catch {
    return null;
  }
})();
/** Para biriminin en küçük birim çarpanı (100 = kuruş/cent). Bilinmiyorsa null. */
export function minorUnitFactor(currency: string | null | undefined): number | null {
  const c = (currency ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return null;
  if (META_OFFSET[c]) return META_OFFSET[c];
  if (SUPPORTED && !SUPPORTED.has(c)) return null;
  try {
    return 10 ** (new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits ?? 2);
  } catch {
    return null;
  }
}
export const metaBudget = (v: unknown, currency: string | null) => {
  if (v === undefined || v === null || v === "" || n(v) <= 0) return null;
  const f = minorUnitFactor(currency);
  return f === null ? null : n(v) / f;
};
const micros = (v: unknown) => (v === undefined || v === null || n(v) <= 0 ? null : Math.round((n(v) / 1_000_000) * 100) / 100);

async function pages<T>(first: { data: T[]; paging?: { next?: string } }, max = 50): Promise<T[]> {
  const out: T[] = [];
  let p = first;
  for (let i = 0; i < max; i++) {
    out.push(...p.data);
    if (!p.paging?.next) break;
    p = await graph(p.paging.next, {});
  }
  return out;
}

async function saveDaily(rows: { level: "adset" | "ad"; entityId: string; adSetId: string | null; adId: string | null; date: string; spend: number; impressions: number; clicks: number; purchases: number; purchaseValue: number }[], adAccountId: string) {
  const ops = rows.map((r) => {
    const data = { spend: r.spend, impressions: r.impressions, clicks: r.clicks, purchases: r.purchases, purchaseValue: r.purchaseValue };
    return db.adLevelDaily.upsert({
      where: { level_entityId_date: { level: r.level, entityId: r.entityId, date: r.date } },
      create: { adAccountId, level: r.level, entityId: r.entityId, adSetId: r.adSetId, adId: r.adId, date: r.date, ...data },
      update: data,
    });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
}

const campaignMap = async (adAccountId: string) => new Map((await db.adCampaign.findMany({ where: { adAccountId }, select: { id: true, externalId: true } })).map((c) => [c.externalId, c.id]));

type MetaLevelRow = { adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string; campaign_id?: string; date_start: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] };

/** Meta reklam setleri, reklamlar ve günlük metrikleri. Yeniden çalıştırıldığında tekil anahtarlar sayesinde mükerrer kayıt oluşmaz. */
export async function syncMetaLevels(acc: Acc, token: string, range: { since: string; until: string }) {
  const act = `act_${acc.externalId}`;
  const campaigns = await campaignMap(acc.id);
  const adsets = await pages(await graph<{ data: { id: string; name: string; campaign_id: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string; optimization_goal?: string }[]; paging?: { next?: string } }>(
    `/${act}/adsets`, { fields: "id,name,campaign_id,effective_status,daily_budget,lifetime_budget,optimization_goal", limit: "200" }, token));
  const ads = await pages(await graph<{ data: { id: string; name: string; adset_id: string; campaign_id: string; effective_status?: string; creative?: { id?: string } }[]; paging?: { next?: string } }>(
    `/${act}/ads`, { fields: "id,name,adset_id,campaign_id,effective_status,creative", limit: "200" }, token));
  const insights = async (level: "adset" | "ad") =>
    pages(await graph<{ data: MetaLevelRow[]; paging?: { next?: string } }>(`/${act}/insights`, {
      level, time_increment: "1", limit: "500", time_range: JSON.stringify(range),
      fields: `${level === "ad" ? "ad_id,ad_name," : ""}adset_id,adset_name,campaign_id,spend,impressions,clicks,actions,action_values`,
    }, token), 200);
  const [setRows, adRows] = [await insights("adset"), await insights("ad")];

  // Reklam setleri: listedekiler + yalnızca metriklerde görünenler (silinmiş olanlar).
  const setInfo = new Map<string, { name: string; campaign: string; status?: string; daily?: string; lifetime?: string; goal?: string }>();
  for (const s of adsets) setInfo.set(s.id, { name: s.name, campaign: s.campaign_id, status: s.effective_status, daily: s.daily_budget, lifetime: s.lifetime_budget, goal: s.optimization_goal });
  for (const r of [...setRows, ...adRows]) if (r.adset_id && r.campaign_id && !setInfo.has(r.adset_id)) setInfo.set(r.adset_id, { name: r.adset_name ?? r.adset_id, campaign: r.campaign_id });
  const setId = new Map<string, string>();
  for (const [ext, s] of setInfo) {
    const campaignId = campaigns.get(s.campaign);
    if (!campaignId) continue; // kampanya henüz senkronlanmamış
    const data = { campaignId, kind: "adset", name: s.name, ...(s.status ? { status: s.status } : {}), dailyBudget: metaBudget(s.daily, acc.currency), lifetimeBudget: metaBudget(s.lifetime, acc.currency), ...(s.goal ? { optimization: s.goal } : {}) };
    const saved = await db.adSet.upsert({ where: { adAccountId_externalId: { adAccountId: acc.id, externalId: ext } }, create: { adAccountId: acc.id, externalId: ext, ...data }, update: data, select: { id: true } });
    setId.set(ext, saved.id);
  }
  const adInfo = new Map<string, { name: string; adset: string; campaign: string; status?: string; creative?: string }>();
  for (const a of ads) adInfo.set(a.id, { name: a.name, adset: a.adset_id, campaign: a.campaign_id, status: a.effective_status, creative: a.creative?.id });
  for (const r of adRows) if (r.ad_id && r.adset_id && r.campaign_id && !adInfo.has(r.ad_id)) adInfo.set(r.ad_id, { name: r.ad_name ?? r.ad_id, adset: r.adset_id, campaign: r.campaign_id });
  const adId = new Map<string, string>();
  for (const [ext, a] of adInfo) {
    const campaignId = campaigns.get(a.campaign), adSetId = setId.get(a.adset);
    if (!campaignId || !adSetId) continue;
    const data = { campaignId, adSetId, name: a.name, ...(a.status ? { status: a.status } : {}), ...(a.creative ? { creativeId: a.creative } : {}) };
    const saved = await db.ad.upsert({ where: { adAccountId_externalId: { adAccountId: acc.id, externalId: ext } }, create: { adAccountId: acc.id, externalId: ext, ...data }, update: data, select: { id: true } });
    adId.set(ext, saved.id);
  }
  // Kreatif ayrıntıları ayrı okunur (Marketing API'de iç içe alan genişletme sınırlıdır). Hata reklam metriklerini etkilemez.
  try {
    await syncMetaCreatives(acc, token);
  } catch (e) {
    await db.syncLog.create({ data: { userId: acc.integration.userId, level: "warn", message: `${acc.name}: kreatif bilgisi alınamadı (önceki bilgi korunuyor): ${e instanceof Error ? e.message : e}`.slice(0, 900) } });
  }
  const metric = (r: MetaLevelRow) => ({ date: r.date_start, spend: n(r.spend), impressions: Math.round(n(r.impressions)), clicks: Math.round(n(r.clicks)), purchases: purchaseOf(r.actions), purchaseValue: purchaseOf(r.action_values) });
  await saveDaily([
    ...setRows.filter((r) => r.adset_id && setId.has(r.adset_id)).map((r) => ({ level: "adset" as const, entityId: setId.get(r.adset_id!)!, adSetId: setId.get(r.adset_id!)!, adId: null, ...metric(r) })),
    ...adRows.filter((r) => r.ad_id && adId.has(r.ad_id)).map((r) => ({ level: "ad" as const, entityId: adId.get(r.ad_id!)!, adSetId: setId.get(r.adset_id!) ?? null, adId: adId.get(r.ad_id!)!, ...metric(r) })),
  ], acc.id);
  return { adsets: setId.size, ads: adId.size, rows: setRows.length + adRows.length };
}

type MetaCreative = { id: string; thumbnail_url?: string; image_url?: string; video_id?: string; object_type?: string; asset_feed_spec?: unknown; object_story_spec?: { link_data?: { child_attachments?: unknown[] } } };

/**
 * Meta kreatif türü (belgeye dayalı): carousel → object_story_spec.link_data.child_attachments; video → video_id ya da object_type VIDEO;
 * dinamik kreatif → asset_feed_spec; görsel → object_type PHOTO ya da image_url. Aksi halde ham object_type ile "OTHER".
 */
export function metaCreativeType(c: MetaCreative) {
  if (c.object_story_spec?.link_data?.child_attachments?.length) return "CAROUSEL";
  if (c.video_id || c.object_type === "VIDEO") return "VIDEO";
  if (c.asset_feed_spec) return "DYNAMIC";
  if (c.object_type === "PHOTO" || c.image_url) return "IMAGE";
  return "OTHER";
}

/** Reklamların kreatiflerini 50'lik gruplar halinde okur (çoklu kimlik okuma). Küçük resim adresleri her senkronda yenilenir. */
async function syncMetaCreatives(acc: Acc, token: string) {
  const ads = await db.ad.findMany({ where: { adAccountId: acc.id, creativeId: { not: null } }, select: { id: true, creativeId: true } });
  const ids = [...new Set(ads.map((a) => a.creativeId!))];
  const now = new Date();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await graph<Record<string, MetaCreative>>("/", { ids: chunk.join(","), fields: "id,thumbnail_url,image_url,video_id,object_type,asset_feed_spec,object_story_spec", thumbnail_width: "400", thumbnail_height: "400" }, token);
    for (const cid of chunk) {
      const c = res[cid];
      if (!c) continue;
      await db.ad.updateMany({
        where: { adAccountId: acc.id, creativeId: cid },
        data: { creativeType: metaCreativeType(c), objectType: c.object_type ?? null, thumbnailUrl: c.thumbnail_url ?? null, imageUrl: c.image_url ?? null, videoId: c.video_id ?? null, creativeSyncedAt: now },
      });
    }
  }
}

type GAsset = { adGroupAd?: { ad?: { id?: string } }; adGroupAdAssetView?: { fieldType?: string; performanceLabel?: string }; asset?: { id?: string; type?: string; imageAsset?: { fullSize?: { url?: string } }; youtubeVideoAsset?: { youtubeVideoId?: string }; textAsset?: { text?: string } } };

/**
 * Google reklam asset'leri (ad_group_ad_asset_view): rol, performans etiketi, görsel adresi, YouTube kimliği, metin.
 * Belgeye göre yalnızca App, Demand Gen ve duyarlı arama reklamlarını destekler; duyarlı görüntülü reklamlar desteklenmez.
 * Asset düzeyinde metrik çekilmez; asset'ler reklam kartında gösterilir.
 */
async function syncGoogleAssets(acc: Acc, login: string) {
  const rows = await search<GAsset>(acc.integration, acc.externalId,
    "SELECT ad_group_ad.ad.id, ad_group_ad_asset_view.field_type, ad_group_ad_asset_view.performance_label, asset.id, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id, asset.text_asset.text FROM ad_group_ad_asset_view", login);
  const byAd = new Map<string, { fieldType: string | null; label: string | null; type: string | null; url: string | null; videoId: string | null; text: string | null }[]>();
  for (const r of rows) {
    const id = r.adGroupAd?.ad?.id;
    if (!id) continue;
    (byAd.get(id) ?? byAd.set(id, []).get(id)!).push({
      fieldType: r.adGroupAdAssetView?.fieldType ?? null, label: r.adGroupAdAssetView?.performanceLabel ?? null, type: r.asset?.type ?? null,
      url: r.asset?.imageAsset?.fullSize?.url ?? null, videoId: r.asset?.youtubeVideoAsset?.youtubeVideoId ?? null, text: r.asset?.textAsset?.text ?? null,
    });
  }
  const now = new Date();
  const ads = await db.ad.findMany({ where: { adAccountId: acc.id }, select: { id: true, externalId: true, adType: true } });
  for (const a of ads) {
    const list = byAd.get(a.externalId) ?? [];
    const img = list.find((x) => x.url), vid = list.find((x) => x.videoId);
    const type = /DISPLAY/.test(a.adType ?? "") ? "DISPLAY" : vid ? "VIDEO" : img ? "IMAGE" : list.some((x) => x.text) || /SEARCH|TEXT/.test(a.adType ?? "") ? "TEXT" : "OTHER";
    await db.ad.update({ where: { id: a.id }, data: { assets: list.length ? JSON.stringify(list.slice(0, 40)) : null, thumbnailUrl: img?.url ?? null, videoId: vid?.videoId ?? null, creativeType: type, creativeSyncedAt: now } });
  }
}

type GRow = {
  campaign?: { id?: string }; adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: { status?: string; ad?: { id?: string; name?: string; type?: string } }; segments?: { date?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string };
  campaignBudget?: { amountMicros?: string; totalAmountMicros?: string; period?: string };
};

/** Google Ads bütçeleri, reklam grupları, reklamlar ve günlük metrikleri. */
export async function syncGoogleLevels(acc: Acc, range: { since: string; until: string }) {
  const login = acc.managerId ?? acc.externalId;
  const campaigns = await campaignMap(acc.id);
  const M = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";
  const where = `WHERE segments.date BETWEEN '${range.since}' AND '${range.until}'`;
  // Bütçe ayrı sorgu (bütçe alanları metriklerle seçilemez).
  const budgets = await search<GRow>(acc.integration, acc.externalId, "SELECT campaign.id, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.period FROM campaign", login);
  for (const b of budgets) {
    const id = b.campaign?.id && campaigns.get(b.campaign.id);
    if (!id) continue;
    const custom = b.campaignBudget?.period === "CUSTOM_PERIOD";
    await db.adCampaign.update({ where: { id }, data: { dailyBudget: custom ? null : micros(b.campaignBudget?.amountMicros), lifetimeBudget: custom ? micros(b.campaignBudget?.totalAmountMicros) : null, budgetLevel: "campaign" } });
  }
  const groups = await search<GRow>(acc.integration, acc.externalId, `SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, segments.date, ${M} FROM ad_group ${where}`, login);
  const adsRows = await search<GRow>(acc.integration, acc.externalId, `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.status, segments.date, ${M} FROM ad_group_ad ${where}`, login);

  const setId = new Map<string, string>();
  for (const r of [...groups, ...adsRows]) {
    const g = r.adGroup, campaignId = r.campaign?.id && campaigns.get(r.campaign.id);
    if (!g?.id || !campaignId || setId.has(g.id)) continue;
    const data = { campaignId, kind: "ad_group", name: g.name ?? `Reklam grubu ${g.id}`, ...(g.status ? { status: g.status } : {}) };
    const saved = await db.adSet.upsert({ where: { adAccountId_externalId: { adAccountId: acc.id, externalId: g.id } }, create: { adAccountId: acc.id, externalId: g.id, ...data }, update: data, select: { id: true } });
    setId.set(g.id, saved.id);
  }
  const adId = new Map<string, string>();
  for (const r of adsRows) {
    const a = r.adGroupAd?.ad, campaignId = r.campaign?.id && campaigns.get(r.campaign.id), adSetId = r.adGroup?.id && setId.get(r.adGroup.id);
    if (!a?.id || !campaignId || !adSetId || adId.has(a.id)) continue;
    // Duyarlı arama reklamlarında ad alanı genellikle boştur; tür ve kimlikle adlandırılır.
    const data = { campaignId, adSetId, name: a.name || `${a.type ?? "Reklam"} #${a.id}`, adType: a.type ?? null, ...(r.adGroupAd?.status ? { status: r.adGroupAd.status } : {}) };
    const saved = await db.ad.upsert({ where: { adAccountId_externalId: { adAccountId: acc.id, externalId: a.id } }, create: { adAccountId: acc.id, externalId: a.id, ...data }, update: data, select: { id: true } });
    adId.set(a.id, saved.id);
  }
  try {
    await syncGoogleAssets(acc, login);
  } catch (e) {
    await db.syncLog.create({ data: { userId: acc.integration.userId, level: "warn", message: `${acc.name}: reklam asset bilgisi alınamadı (önceki bilgi korunuyor): ${e instanceof Error ? e.message : e}`.slice(0, 900) } });
  }
  const metric = (r: GRow) => ({ date: r.segments!.date!, spend: Math.round((n(r.metrics?.costMicros) / 1_000_000) * 100) / 100, impressions: Math.round(n(r.metrics?.impressions)), clicks: Math.round(n(r.metrics?.clicks)), purchases: n(r.metrics?.conversions), purchaseValue: n(r.metrics?.conversionsValue) });
  await saveDaily([
    ...groups.filter((r) => r.adGroup?.id && setId.has(r.adGroup.id) && r.segments?.date).map((r) => ({ level: "adset" as const, entityId: setId.get(r.adGroup!.id!)!, adSetId: setId.get(r.adGroup!.id!)!, adId: null, ...metric(r) })),
    ...adsRows.filter((r) => r.adGroupAd?.ad?.id && adId.has(r.adGroupAd.ad.id) && r.segments?.date).map((r) => ({ level: "ad" as const, entityId: adId.get(r.adGroupAd!.ad!.id!)!, adSetId: setId.get(r.adGroup!.id!) ?? null, adId: adId.get(r.adGroupAd!.ad!.id!)!, ...metric(r) })),
  ], acc.id);
  return { adsets: setId.size, ads: adId.size, rows: groups.length + adsRows.length };
}

/** Düzey senkronu hatası: hesaba yazılır ve Kayıtlar ekranına düşer; kampanya verisi etkilenmez. */
export async function levelFailure(acc: Acc, userId: string, e: unknown) {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  await db.adAccount.update({ where: { id: acc.id }, data: { levelError: message } });
  await db.syncLog.create({ data: { userId, level: "error", message: `${acc.name}: reklam seti/reklam verisi alınamadı: ${message}`.slice(0, 900) } });
}

export type ReachResult = { state: "ok" | "unsupported" | "missing" | "error"; campaign: { reach: number | null; frequency: number | null } | null; adsets: Map<string, { reach: number | null; frequency: number | null }>; ads: Map<string, { reach: number | null; frequency: number | null }>; error?: string; fetchedAt?: Date };
const REACH_TTL = 6 * 3600_000;

/**
 * Kampanyanın seçili dönemdeki tekilleştirilmiş erişimi ve frekansı (Meta). Google'da desteklenmez.
 * 6 saat önbellekte tutulur. Demo bağlantılarda yalnızca kayıtlı veri okunur (API çağrılmaz).
 */
export async function campaignReach(campaignId: string, userId: string, from: string, to: string): Promise<ReachResult> {
  const c = await db.adCampaign.findFirst({ where: { id: campaignId, adAccount: { integration: { userId } } }, include: { adAccount: { include: { integration: true } }, adSets: { select: { id: true, externalId: true } }, ads: { select: { id: true, externalId: true } } } });
  const blank = { campaign: null, adsets: new Map(), ads: new Map() };
  if (!c) return { state: "missing", ...blank };
  if (c.adAccount.provider !== "meta") return { state: "unsupported", ...blank };
  const read = async () => {
    const rows = await db.adReachPeriod.findMany({ where: { adAccountId: c.adAccountId, fromDate: from, toDate: to, entityId: { in: [c.id, ...c.adSets.map((s) => s.id), ...c.ads.map((a) => a.id)] } } });
    const v = (r: (typeof rows)[number]) => ({ reach: r.reach, frequency: r.frequency });
    const camp = rows.find((r) => r.level === "campaign");
    return { rows, out: { campaign: camp ? v(camp) : null, adsets: new Map(rows.filter((r) => r.level === "adset").map((r) => [r.entityId, v(r)])), ads: new Map(rows.filter((r) => r.level === "ad").map((r) => [r.entityId, v(r)])) }, fetchedAt: camp?.fetchedAt };
  };
  const cached = await read();
  const fresh = cached.fetchedAt && Date.now() - cached.fetchedAt.getTime() < REACH_TTL;
  const demo = c.adAccount.integration.externalUserId.startsWith("demo-");
  if (fresh || demo) return { state: cached.out.campaign ? "ok" : "missing", ...cached.out, fetchedAt: cached.fetchedAt };
  if (c.adAccount.integration.status !== "active") return { state: cached.out.campaign ? "ok" : "missing", ...cached.out, fetchedAt: cached.fetchedAt };
  try {
    const { decrypt } = await import("../crypto");
    const token = decrypt(c.adAccount.integration.accessTokenEnc);
    const time_range = JSON.stringify({ since: from, until: to });
    type R = { data: { reach?: string; frequency?: string; adset_id?: string; ad_id?: string }[]; paging?: { next?: string } };
    const [camp, sets, ads] = await Promise.all([
      graph<R>(`/${c.externalId}/insights`, { level: "campaign", time_range, fields: "reach,frequency" }, token),
      graph<R>(`/${c.externalId}/insights`, { level: "adset", time_range, fields: "adset_id,reach,frequency", limit: "500" }, token).then(pages),
      graph<R>(`/${c.externalId}/insights`, { level: "ad", time_range, fields: "ad_id,reach,frequency", limit: "500" }, token).then(pages),
    ]);
    const setOf = new Map(c.adSets.map((s) => [s.externalId, s.id])), adOf = new Map(c.ads.map((a) => [a.externalId, a.id]));
    const val = (r: { reach?: string; frequency?: string }) => ({ reach: r.reach === undefined ? null : Math.round(n(r.reach)), frequency: r.frequency === undefined ? null : n(r.frequency) });
    const entries = [
      ...(camp.data[0] ? [{ level: "campaign", entityId: c.id, ...val(camp.data[0]) }] : [{ level: "campaign", entityId: c.id, reach: 0, frequency: null }]), // satır yok = dönemde gösterim yok
      ...sets.filter((r) => r.adset_id && setOf.has(r.adset_id)).map((r) => ({ level: "adset", entityId: setOf.get(r.adset_id!)!, ...val(r) })),
      ...ads.filter((r) => r.ad_id && adOf.has(r.ad_id)).map((r) => ({ level: "ad", entityId: adOf.get(r.ad_id!)!, ...val(r) })),
    ];
    const now = new Date();
    await db.$transaction(entries.map((e) => db.adReachPeriod.upsert({
      where: { level_entityId_fromDate_toDate: { level: e.level, entityId: e.entityId, fromDate: from, toDate: to } },
      create: { adAccountId: c.adAccountId, level: e.level, entityId: e.entityId, fromDate: from, toDate: to, reach: e.reach, frequency: e.frequency, fetchedAt: now },
      update: { reach: e.reach, frequency: e.frequency, fetchedAt: now },
    })));
    const again = await read();
    return { state: "ok", ...again.out, fetchedAt: now };
  } catch (e) {
    return { state: cached.out.campaign ? "ok" : "error", ...cached.out, fetchedAt: cached.fetchedAt, error: e instanceof Error ? e.message : String(e) };
  }
}
