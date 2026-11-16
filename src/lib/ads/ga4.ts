// Google Analytics 4 — mülk listesi ve günlük oturum / gelir verisi.
// Kaynak: developers.google.com/analytics — Data API runReport (v1beta), api-schema, quotas, errors.
// Belgeden: date boyutu YYYYMMDD; metrik değerleri metin; metrikleri 0 olan satırlar dönmez (keepEmptyRows=false);
// istek başına en fazla 250.000 satır; kota bitince 429 RESOURCE_EXHAUSTED; yanıtta mülkün para birimi ve saat dilimi var.
// GERÇEK HESAPTA DOĞRULANACAK: mülk listesi için Admin API accountSummaries uç noktası (belgesi okunamadı). Liste
// alınamazsa mülk kimliği elle girilip Data API ile doğrulanabilir.
import { db } from "../db";
import { GoogleError, googleFetch, recordGoogleFailure, type GoogleInteg } from "./google";

const DATA_URL = process.env.GA4_DATA_URL ?? "https://analyticsdata.googleapis.com/v1beta";
const ADMIN_URL = process.env.GA4_ADMIN_URL ?? "https://analyticsadmin.googleapis.com/v1beta";
const FIRST_SYNC_DAYS = 90;
const REFRESH_DAYS = 28;
const MIN_INTERVAL_MS = 30 * 60_000;

type ApiError = { error?: { code: number; message: string; status?: string } };

async function call<T>(integ: GoogleInteg, url: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await googleFetch(integ, url, { method, body });
  const json = (await res.json().catch(() => null)) as (T & ApiError) | null;
  if (res.ok && json && !json.error) return json;
  const msg = json?.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw new GoogleError("Google Analytics yetkisi geçersiz. Hesabı yeniden bağlayın.", "auth");
  if (res.status === 429) throw new GoogleError("Google Analytics kotası doldu (mülk başına günlük/saatlik sınır). Daha sonra yeniden deneyin.", "quota");
  // 403: Admin API'de çoğunlukla API'nin Cloud projesinde açık olmaması; Data API'de mülke erişim olmaması.
  if (res.status === 403)
    throw new GoogleError(url.startsWith(ADMIN_URL) ? `Mülk listesi alınamadı; Cloud projesinde Google Analytics Admin API açık olmayabilir (${msg})` : `Bu Google kullanıcısının mülke erişimi yok: ${msg}`, "access");
  if (res.status === 404) throw new GoogleError("Mülk bulunamadı. Mülk kimliğini kontrol edin.", "access");
  throw new GoogleError(`Google Analytics API hatası: ${msg}`);
}

type Summary = { account?: string; displayName?: string; propertySummaries?: { property?: string; displayName?: string }[] };

/** Kullanıcının erişebildiği GA4 mülkleri (Admin API). Yeni mülkler kaydedilir; mevcutların adı güncellenir. */
export async function syncGa4Properties(integrationId: string, userId: string) {
  const integ = await db.adIntegration.findFirst({ where: { id: integrationId, userId, provider: "ga4" } });
  if (!integ) throw new GoogleError("Bağlantı bulunamadı.");
  const found: { propertyId: string; name: string; account: string | null }[] = [];
  try {
    let pageToken: string | undefined;
    for (let i = 0; i < 50; i++) {
      const r = await call<{ accountSummaries?: Summary[]; nextPageToken?: string }>(integ, `${ADMIN_URL}/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, "GET");
      for (const a of r.accountSummaries ?? [])
        for (const p of a.propertySummaries ?? []) {
          const id = (p.property ?? "").replace(/^properties\//, "");
          if (/^\d+$/.test(id)) found.push({ propertyId: id, name: p.displayName || id, account: a.displayName ?? null });
        }
      if (!r.nextPageToken) break;
      pageToken = r.nextPageToken;
    }
  } catch (e) {
    await recordGoogleFailure({ ...integ, provider: "ga4" }, userId, e);
    throw e;
  }
  for (const p of found)
    await db.analyticsProperty.upsert({
      where: { integrationId_propertyId: { integrationId: integ.id, propertyId: p.propertyId } },
      create: { integrationId: integ.id, propertyId: p.propertyId, name: p.name, accountName: p.account },
      update: { name: p.name, accountName: p.account },
    });
  // Elle eklenen ve hâlâ erişilebilen mülkler korunur; yalnızca bu listede olmayıp hiç veri çekilmemişler silinir.
  await db.analyticsProperty.deleteMany({ where: { integrationId: integ.id, propertyId: { notIn: found.map((p) => p.propertyId) }, metricsSyncedAt: null, websiteId: null } });
  await db.adIntegration.update({ where: { id: integ.id }, data: { status: "active", lastError: null, lastSyncAt: new Date() } });
  return found.length;
}

type Report = { rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]; rowCount?: number; metadata?: { currencyCode?: string; timeZone?: string } };

const runReport = (integ: GoogleInteg, propertyId: string, body: unknown) => call<Report>(integ, `${DATA_URL}/properties/${propertyId}:runReport`, "POST", body);

/** Mülk kimliğini Data API ile doğrulayıp ekler (liste alınamadığında ya da listede yoksa). */
export async function addGa4Property(integrationId: string, userId: string, rawId: string) {
  const integ = await db.adIntegration.findFirst({ where: { id: integrationId, userId, provider: "ga4" } });
  if (!integ) throw new GoogleError("Bağlantı bulunamadı.");
  const propertyId = rawId.trim().replace(/^properties\//, "");
  if (!/^\d{1,20}$/.test(propertyId)) throw new GoogleError("Mülk kimliği yalnızca rakamlardan oluşmalı (ör. 123456789).");
  const r = await runReport(integ, propertyId, { dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "sessions" }], limit: "1" });
  return db.analyticsProperty.upsert({
    where: { integrationId_propertyId: { integrationId: integ.id, propertyId } },
    create: { integrationId: integ.id, propertyId, name: `Mülk ${propertyId}`, currency: r.metadata?.currencyCode ?? null, timezone: r.metadata?.timeZone ?? null },
    update: { currency: r.metadata?.currencyCode ?? null, timezone: r.metadata?.timeZone ?? null },
  });
}

const num = (v?: string) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const ymd = (d: Date, tz: string | null) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/**
 * GA4 huni raporu: tarih × sessionSource × sessionMedium × sessionCampaignName × sessionGoogleAdsCampaignName;
 * sessions, itemViewEvents, addToCarts, checkouts, ecommercePurchases, purchaseRevenue (alanlar Data API şemasında doğrulandı).
 */
async function syncGa4Funnel(p: { id: string; propertyId: string; timezone: string | null; integration: Parameters<typeof runReport>[0] }, since: Date, until: Date) {
  const rows: NonNullable<Report["rows"]> = [];
  for (let offset = 0, i = 0; i < 25; i++) {
    const r = await runReport(p.integration, p.propertyId, {
      dateRanges: [{ startDate: ymd(since, p.timezone), endDate: ymd(until, p.timezone) }],
      dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }, { name: "sessionCampaignName" }, { name: "sessionGoogleAdsCampaignName" }],
      metrics: [{ name: "sessions" }, { name: "itemViewEvents" }, { name: "addToCarts" }, { name: "checkouts" }, { name: "ecommercePurchases" }, { name: "purchaseRevenue" }],
      limit: "10000",
      offset: String(offset),
    });
    rows.push(...(r.rows ?? []));
    offset += r.rows?.length ?? 0;
    if (!r.rows?.length || offset >= (r.rowCount ?? 0)) break;
  }
  const ops = rows.map((r) => {
    const [d, source, medium, campaign, gads] = (r.dimensionValues ?? []).map((v) => v.value || "(not set)");
    const m = (r.metricValues ?? []).map((v) => v.value);
    const date = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
    const key = { propertyId: p.id, date, source, medium, campaign, googleAdsCampaign: gads };
    const data = { sessions: Math.round(num(m[0])), itemViews: num(m[1]), addToCarts: num(m[2]), checkouts: num(m[3]), purchases: num(m[4]), revenue: num(m[5]) };
    return db.analyticsCampaignDaily.upsert({ where: { propertyId_date_source_medium_campaign_googleAdsCampaign: key }, create: { ...key, ...data }, update: data });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
}

/** Bir mülkün günlük, kanal kırılımlı verisini çeker. Yalnızca bir siteye atanmış mülkler çekilir. */
export async function syncGa4Metrics(propertyDbId: string, userId: string, force = false) {
  const p = await db.analyticsProperty.findFirst({ where: { id: propertyDbId, integration: { userId, provider: "ga4" } }, include: { integration: true } });
  if (!p) throw new GoogleError("Mülk bulunamadı.");
  if (p.integration.status !== "active") throw new GoogleError("Google Analytics bağlantısı aktif değil; yeniden bağlayın.", "auth");
  if (!force && p.metricsSyncedAt && Date.now() - p.metricsSyncedAt.getTime() < MIN_INTERVAL_MS) return { skipped: true, rows: 0 };
  const until = new Date();
  const since = new Date(until.getTime() - (p.metricsSyncedAt ? REFRESH_DAYS : FIRST_SYNC_DAYS) * 86400000);
  const rows: NonNullable<Report["rows"]> = [];
  let meta: Report["metadata"];
  try {
    for (let offset = 0, i = 0; i < 20; i++) {
      const r = await runReport(p.integration, p.propertyId, {
        dateRanges: [{ startDate: ymd(since, p.timezone), endDate: ymd(until, p.timezone) }],
        dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "keyEvents" }, { name: "ecommercePurchases" }, { name: "purchaseRevenue" }],
        limit: "10000",
        offset: String(offset),
      });
      meta ??= r.metadata;
      rows.push(...(r.rows ?? []));
      offset += r.rows?.length ?? 0;
      if (!r.rows?.length || offset >= (r.rowCount ?? 0)) break;
    }
  } catch (e) {
    await recordGoogleFailure({ ...p.integration, provider: "ga4" }, userId, e);
    await db.analyticsProperty.update({ where: { id: p.id }, data: { metricsError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }
  const ops = rows.map((r) => {
    const [d, channel] = (r.dimensionValues ?? []).map((v) => v.value ?? "");
    const m = (r.metricValues ?? []).map((v) => v.value);
    const date = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
    const data = { sessions: Math.round(num(m[0])), users: Math.round(num(m[1])), keyEvents: num(m[2]), purchases: num(m[3]), revenue: num(m[4]) };
    return db.analyticsDaily.upsert({ where: { propertyId_date_channel: { propertyId: p.id, date, channel: channel || "(not set)" } }, create: { propertyId: p.id, date, channel: channel || "(not set)", ...data }, update: data });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  // Kampanya/kaynak kırılımlı e-ticaret hunisi (ayrı rapor). Hata kanal verisini etkilemez; kayda geçer.
  try {
    await syncGa4Funnel(p, since, until);
  } catch (e) {
    await db.syncLog.create({ data: { userId, level: "warn", message: `${p.name}: GA4 huni verisi alınamadı (kanal verisi etkilenmedi): ${e instanceof Error ? e.message : e}`.slice(0, 900) } });
  }
  await db.analyticsProperty.update({ where: { id: p.id }, data: { metricsSyncedAt: new Date(), metricsError: null, ...(meta?.currencyCode ? { currency: meta.currencyCode } : {}), ...(meta?.timeZone ? { timezone: meta.timeZone } : {}) } });
  return { skipped: false, rows: rows.length };
}
