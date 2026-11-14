// Google Ads API istemcisi — OAuth 2.0 bağlantısı, token yenileme, erişilebilir hesaplar ve MCC alt hesapları.
// Kaynak: developers.google.com — OAuth 2.0 for web server apps, Google Ads REST auth/overview, access levels, errors.
// Notlar:
//  - Belgeye göre geliştirici anahtarları 9 Eylül 2026'da kaldırıldı; erişim Cloud projesine bağlı. GOOGLE_ADS_DEVELOPER_TOKEN
//    tanımlıysa yine de "developer-token" başlığıyla gönderilir (belge: isteğe bağlı, sunucu yok sayar).
//  - GERÇEK HESAPTA DOĞRULANACAK: customer ve customer_client GAQL sorgularının alan adları (alan referansı okunamadı).
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { notify } from "../notify";

export const GOOGLE_ADS_VERSION = process.env.GOOGLE_ADS_VERSION ?? "v26";
// Adresler yalnızca yerel test (scripts/mock-google.mjs) için ortam değişkeniyle değiştirilebilir.
const AUTH_URL = process.env.GOOGLE_AUTH_URL ?? "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token";
const REVOKE_URL = process.env.GOOGLE_REVOKE_URL ?? "https://oauth2.googleapis.com/revoke";
const ADS_URL = process.env.GOOGLE_ADS_URL ?? `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}`;
// openid + email: bağlanan Google kullanıcısını tanımak için (aynı kullanıcı yeniden bağlanınca tek kayıt kalsın).
// Google Ads ve GA4 ayrı bağlantılardır: kullanıcı yalnızca ihtiyaç duyduğu izni verir.
export type GoogleKind = "google" | "ga4";
export const GOOGLE_SCOPES: Record<GoogleKind, string[]> = {
  google: ["openid", "email", "https://www.googleapis.com/auth/adwords"],
  ga4: ["openid", "email", "https://www.googleapis.com/auth/analytics.readonly"],
};
const CALLBACK: Record<GoogleKind, string> = { google: "/api/google/callback", ga4: "/api/ga4/callback" };

export class GoogleError extends Error {
  constructor(message: string, public kind?: "auth" | "quota" | "access" | "other") {
    super(message);
  }
}

export function googleApp() {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return clientId && clientSecret && base ? { clientId, clientSecret, base, developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || null } : null;
}

export function googleAuthorizeUrl(state: string, kind: GoogleKind = "google") {
  const app = googleApp();
  if (!app) throw new GoogleError("Google uygulama anahtarları tanımlı değil.");
  // access_type=offline + prompt=consent: yenileme token'ı (refresh_token) her bağlantıda alınsın.
  const p = new URLSearchParams({ client_id: app.clientId, redirect_uri: app.base + CALLBACK[kind], response_type: "code", scope: GOOGLE_SCOPES[kind].join(" "), access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body), cache: "no-store" }).catch((e) => {
    throw new GoogleError(`Google'a ulaşılamadı: ${e instanceof Error ? e.message : e}`);
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (json.error === "invalid_grant") throw new GoogleError("Google yetkisinin süresi dolmuş ya da geri alınmış. Hesabı yeniden bağlayın.", "auth");
  if (!res.ok || !json.access_token) throw new GoogleError(`Google yetkilendirme hatası: ${json.error_description ?? json.error ?? `HTTP ${res.status}`}`, "auth");
  return json;
}

/** id_token'ın içeriğini okur. Token doğrudan Google'ın token ucundan TLS ile alındığı için imza ayrıca doğrulanmaz. */
function idClaims(idToken?: string): { sub?: string; email?: string } {
  try {
    return JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/** Onay kodunu token'lara çevirir. Yenileme token'ı gelmezse bağlantı uzun süre çalışamaz; bu durumda hata verilir. */
export async function googleExchangeCode(code: string, kind: GoogleKind = "google") {
  const app = googleApp();
  if (!app) throw new GoogleError("Google uygulama anahtarları tanımlı değil.");
  const t = await tokenRequest({ code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.base + CALLBACK[kind], grant_type: "authorization_code" });
  if (!t.refresh_token) throw new GoogleError("Google yenileme yetkisi vermedi. Bağlantıyı yeniden başlatın ve izin ekranını onaylayın.", "auth");
  const c = idClaims(t.id_token);
  if (!c.sub) throw new GoogleError("Google kullanıcı kimliği alınamadı.", "auth");
  return { accessToken: t.access_token!, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000), userId: c.sub, email: c.email ?? null };
}

export async function saveGoogleIntegration(userId: string, x: Awaited<ReturnType<typeof googleExchangeCode>>, kind: GoogleKind = "google") {
  const data = { displayName: x.email, accessTokenEnc: encrypt(x.accessToken), refreshTokenEnc: encrypt(x.refreshToken), tokenExpiresAt: x.expiresAt, scopes: GOOGLE_SCOPES[kind].join(" "), status: "active", lastError: null };
  return db.adIntegration.upsert({
    where: { userId_provider_externalUserId: { userId, provider: kind, externalUserId: x.userId } },
    create: { userId, provider: kind, externalUserId: x.userId, ...data },
    update: data,
  });
}

export type GoogleInteg = { id: string; status: string; displayName: string | null; accessTokenEnc: string; refreshTokenEnc: string | null; tokenExpiresAt: Date | null };

/** Geçerli erişim token'ı döner; süresi 2 dakikadan az kaldıysa yenileme token'ıyla yeniler. */
async function accessToken(integ: GoogleInteg, force = false): Promise<string> {
  if (!force && integ.tokenExpiresAt && integ.tokenExpiresAt.getTime() - Date.now() > 2 * 60_000) return decrypt(integ.accessTokenEnc);
  const app = googleApp();
  if (!app) throw new GoogleError("Google uygulama anahtarları tanımlı değil.");
  if (!integ.refreshTokenEnc) throw new GoogleError("Google yenileme yetkisi yok. Hesabı yeniden bağlayın.", "auth");
  const t = await tokenRequest({ client_id: app.clientId, client_secret: app.clientSecret, refresh_token: decrypt(integ.refreshTokenEnc), grant_type: "refresh_token" });
  const expiresAt = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
  await db.adIntegration.update({ where: { id: integ.id }, data: { accessTokenEnc: encrypt(t.access_token!), tokenExpiresAt: expiresAt, ...(t.refresh_token ? { refreshTokenEnc: encrypt(t.refresh_token) } : {}) } });
  integ.accessTokenEnc = encrypt(t.access_token!);
  integ.tokenExpiresAt = expiresAt;
  return t.access_token!;
}

const RETRY = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Google API isteği (Ads ve Analytics ortak). 401'de token'ı bir kez yeniler; 429 ve geçici sunucu hatalarında
 * rastgele gecikmeli artan beklemeyle en fazla 3 kez yeniden dener. Hata ayrıştırmayı çağırana bırakır.
 */
export async function googleFetch(integ: GoogleInteg, url: string, init: { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string> }) {
  let token = await accessToken(integ);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: init.method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    }).catch((e) => {
      throw new GoogleError(`Google API'ye ulaşılamadı: ${e instanceof Error ? e.message : e}`);
    });
    if (res.status === 401 && attempt === 0) {
      token = await accessToken(integ, true);
      continue;
    }
    if (RETRY.has(res.status) && attempt < 3) {
      await sleep(1000 * 2 ** attempt + Math.random() * 500);
      continue;
    }
    return res;
  }
}

/** Google Ads REST isteği. */
async function ads<T>(integ: GoogleInteg, method: "GET" | "POST", path: string, body?: unknown, loginCustomerId?: string): Promise<T> {
  const app = googleApp();
  const res = await googleFetch(integ, `${ADS_URL}${path}`, {
    method,
    body,
    headers: {
      ...(app?.developerToken ? { "developer-token": app.developerToken } : {}),
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId.replace(/-/g, "") } : {}),
    },
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: { code: number; message: string; status?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } }) | null;
  if (res.ok && json && !json.error) return json;
  const err = json?.error;
  const codes = (err?.details ?? []).flatMap((d) => d.errors ?? []).map((e) => Object.values(e.errorCode ?? {}).join(""));
  if (res.status === 401) throw new GoogleError("Google yetkisi geçersiz. Hesabı yeniden bağlayın.", "auth");
  if (res.status === 429) throw new GoogleError("Google Ads istek kotası doldu. Daha sonra yeniden deneyin.", "quota");
  if (codes.includes("CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION")) throw new GoogleError("Google Cloud projesinin Google Ads erişimi yalnızca test hesapları için onaylı. Gerçek hesaplar için Basic ya da Standard erişim başvurusu gerekiyor.", "access");
  if (res.status === 403) throw new GoogleError(`Google Ads bu hesaba erişime izin vermedi: ${err?.message ?? ""}`.trim(), "access");
  throw new GoogleError(`Google Ads API hatası: ${err?.message ?? `HTTP ${res.status}`}`);
}

/** GAQL sorgusu (sayfalı). */
async function search<R>(integ: GoogleInteg, customerId: string, query: string, loginCustomerId?: string): Promise<R[]> {
  const out: R[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 100; i++) {
    const r = await ads<{ results?: R[]; nextPageToken?: string }>(integ, "POST", `/customers/${customerId}/googleAds:search`, { query, ...(pageToken ? { page_token: pageToken } : {}) }, loginCustomerId);
    out.push(...(r.results ?? []));
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out;
}

export async function recordGoogleFailure(integ: GoogleInteg & { provider?: string }, userId: string, e: unknown) {
  if (e instanceof GoogleError && e.kind === "auth") {
    await db.adIntegration.update({ where: { id: integ.id }, data: { status: "expired", lastError: e.message } });
    if (integ.status !== "expired")
      await notify([{ userId, kind: "automation", title: `${integ.provider === "ga4" ? "Google Analytics" : "Google Ads"} bağlantısı kesildi`, body: `${integ.displayName ?? "Google"} bağlantısının yetkisi geçersiz. Veriler güncellenmeyecek; hesabı yeniden bağlayın.`, link: "/reklam-hesaplari" }]);
  } else await db.adIntegration.update({ where: { id: integ.id }, data: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
}

type CustomerRow = { customer?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; testAccount?: boolean } };
type ClientRow = { customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string; timeZone?: string; manager?: boolean; level?: string | number; hidden?: boolean; status?: string } };

/**
 * Kullanıcının erişebildiği Google Ads hesaplarını kaydeder. Yönetici (MCC) hesapların altındaki reklam hesapları da
 * eklenir ve managerId alanına MCC kimliği yazılır (veri çekerken login-customer-id olarak kullanılır).
 * Yönetici hesapların kendisi reklam verisi taşımadığı için listeye eklenmez.
 */
export async function syncGoogleAccounts(integrationId: string, userId: string) {
  const integ = await db.adIntegration.findFirst({ where: { id: integrationId, userId, provider: "google" } });
  if (!integ) throw new GoogleError("Bağlantı bulunamadı.");
  const found = new Map<string, { name: string; currency: string | null; timezone: string | null; managerId: string | null }>();
  try {
    const list = await ads<{ resourceNames?: string[] }>(integ, "GET", "/customers:listAccessibleCustomers");
    for (const rn of list.resourceNames ?? []) {
      const id = rn.replace(/^customers\//, "");
      const [self] = await search<CustomerRow>(integ, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.test_account FROM customer", id);
      const c = self?.customer;
      if (!c) continue;
      if (!c.manager) {
        if (!found.has(id)) found.set(id, { name: c.descriptiveName || id, currency: c.currencyCode ?? null, timezone: c.timeZone ?? null, managerId: null });
        continue;
      }
      // MCC: doğrudan alt hesaplar (level 1), yönetici olmayanlar.
      const clients = await search<ClientRow>(integ, id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.level, customer_client.hidden, customer_client.status FROM customer_client WHERE customer_client.level = 1", id);
      for (const r of clients) {
        const cc = r.customerClient;
        if (!cc?.id || cc.manager || cc.hidden) continue;
        // Kullanıcının doğrudan erişimi varsa (managerId null) o kayıt korunur.
        if (!found.has(cc.id)) found.set(cc.id, { name: cc.descriptiveName || cc.id, currency: cc.currencyCode ?? null, timezone: cc.timeZone ?? null, managerId: id });
      }
    }
  } catch (e) {
    await recordGoogleFailure(integ, userId, e);
    throw e;
  }
  for (const [externalId, a] of found) {
    await db.adAccount.upsert({
      where: { integrationId_externalId: { integrationId: integ.id, externalId } },
      create: { integrationId: integ.id, provider: "google", externalId, name: a.name, currency: a.currency, timezone: a.timezone, managerId: a.managerId },
      update: { name: a.name, currency: a.currency, timezone: a.timezone, managerId: a.managerId },
    });
  }
  await db.adAccount.deleteMany({ where: { integrationId: integ.id, externalId: { notIn: [...found.keys()] } } });
  await db.adIntegration.update({ where: { id: integ.id }, data: { status: "active", lastError: null, lastSyncAt: new Date() } });
  return found.size;
}

// ───────────── Reklam verisi ─────────────
// Belge: tarih aralığı hesabın saat diliminde (customer.time_zone) değerlendirilir; günlük kırılımda verisi olmayan
// günler dönmez; int64 alanlar JSON'da metin olarak gelir.
// DOĞRULANAMAYAN: cost_micros birimi (milyonda bir para birimi varsayıldı) ve dönüşümlerin kaç gün geriye düzeltildiği
// (Meta ile aynı 28 günlük yenileme penceresi kullanıldı).
const FIRST_SYNC_DAYS = 90;
const REFRESH_DAYS = 28;
const MIN_INTERVAL_MS = 30 * 60_000;

type MetricRow = {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string };
};
const num = (v: unknown) => {
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
 * Seçili bir Google Ads hesabının kampanya bazlı günlük metriklerini çekip kaydeder.
 * MCC altındaki hesaplarda login-customer-id olarak yönetici hesap kullanılır.
 * Google "dönüşüm" sayısı yalnızca satın almaları değil, dönüşüme dahil edilen tüm eylemleri içerir.
 */
export async function syncGoogleMetrics(adAccountId: string, userId: string, force = false) {
  const acc = await db.adAccount.findFirst({ where: { id: adAccountId, provider: "google", integration: { userId } }, include: { integration: true } });
  if (!acc) throw new GoogleError("Reklam hesabı bulunamadı.");
  if (acc.integration.status !== "active") throw new GoogleError("Google Ads bağlantısı aktif değil; hesabı yeniden bağlayın.", "auth");
  if (!force && acc.metricsSyncedAt && Date.now() - acc.metricsSyncedAt.getTime() < MIN_INTERVAL_MS) return { skipped: true, rows: 0 };
  const until = new Date();
  const since = new Date(until.getTime() - (acc.metricsSyncedAt ? REFRESH_DAYS : FIRST_SYNC_DAYS) * 86400000);
  const query =
    "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value " +
    `FROM campaign WHERE segments.date BETWEEN '${ymd(since, acc.timezone)}' AND '${ymd(until, acc.timezone)}'`;
  let rows: MetricRow[];
  try {
    rows = await search<MetricRow>(acc.integration, acc.externalId, query, acc.managerId ?? acc.externalId);
  } catch (e) {
    await recordGoogleFailure(acc.integration, userId, e);
    await db.adAccount.update({ where: { id: acc.id }, data: { metricsError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }
  const idOf = new Map<string, string>();
  for (const r of rows) {
    const c = r.campaign;
    if (!c?.id || idOf.has(c.id)) continue;
    const saved = await db.adCampaign.upsert({
      where: { adAccountId_externalId: { adAccountId: acc.id, externalId: c.id } },
      create: { adAccountId: acc.id, externalId: c.id, name: c.name ?? c.id, status: c.status ?? null, objective: c.advertisingChannelType ?? null },
      update: { name: c.name ?? c.id, status: c.status ?? null, objective: c.advertisingChannelType ?? null },
      select: { id: true },
    });
    idOf.set(c.id, saved.id);
  }
  const ops = rows.filter((r) => r.campaign?.id && r.segments?.date).map((r) => {
    const campaignId = idOf.get(r.campaign!.id!)!;
    const m = r.metrics ?? {};
    const data = {
      currency: acc.currency, spend: Math.round((num(m.costMicros) / 1_000_000) * 100) / 100, impressions: Math.round(num(m.impressions)), reach: 0,
      clicks: Math.round(num(m.clicks)), purchases: num(m.conversions), purchaseValue: num(m.conversionsValue),
    };
    return db.adDailyMetric.upsert({ where: { campaignId_date: { campaignId, date: r.segments!.date! } }, create: { adAccountId: acc.id, campaignId, date: r.segments!.date!, ...data }, update: data });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  await db.adAccount.update({ where: { id: acc.id }, data: { metricsSyncedAt: new Date(), metricsError: null } });
  return { skipped: false, rows: rows.length };
}

/** Google'daki yetkiyi geri almayı dener; başarısız olsa da yerel bağlantı silinir. */
export async function revokeGoogle(refreshTokenEnc: string | null) {
  if (!refreshTokenEnc) return;
  await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(refreshTokenEnc) }), cache: "no-store" }).catch(() => null);
}
