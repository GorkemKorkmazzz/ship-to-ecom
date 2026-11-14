// Meta (Facebook) Marketing API istemcisi — OAuth bağlantısı ve reklam hesapları.
// Kaynak: developers.facebook.com — manual login flow, long-lived tokens, rate limiting, error handling, AdAccount reference.
// GERÇEK HESAPTA DOĞRULANACAK: /me/adaccounts uç noktasının istediği izin (ads_read varsayıldı) ve sayfalama biçimi
// (Graph API'nin genel data[] + paging.next biçimi varsayıldı); bu uç noktanın referans sayfası okunamadı.
import { createHmac } from "crypto";
import { decrypt, encrypt } from "../crypto";
import { db } from "../db";
import { notify } from "../notify";

const VERSION = process.env.META_GRAPH_VERSION ?? "v27.0";
// Adresler yalnızca yerel test (scripts/mock-meta.mjs) için ortam değişkeniyle değiştirilebilir.
const DIALOG_URL = process.env.META_DIALOG_URL ?? `https://www.facebook.com/${VERSION}/dialog/oauth`;
const GRAPH_URL = process.env.META_GRAPH_URL ?? `https://graph.facebook.com/${VERSION}`;
export const META_SCOPES = ["ads_read"];

export class MetaError extends Error {
  constructor(message: string, public code?: number, public subcode?: number) {
    super(message);
  }
}

/** Uygulama anahtarları (Meta for Developers). Yoksa Meta bağlantısı kapalıdır. */
export function metaApp() {
  const appId = process.env.META_APP_ID ?? "";
  const appSecret = process.env.META_APP_SECRET ?? "";
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return appId && appSecret && base ? { appId, appSecret, redirectUri: `${base}/api/meta/callback` } : null;
}

export function metaAuthorizeUrl(state: string) {
  const app = metaApp();
  if (!app) throw new MetaError("Meta uygulama anahtarları tanımlı değil.");
  const p = new URLSearchParams({ client_id: app.appId, redirect_uri: app.redirectUri, state, scope: META_SCOPES.join(","), response_type: "code" });
  return `${DIALOG_URL}?${p}`;
}

const THROTTLE = new Set([4, 17, 32, 613, 80000, 80004]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Graph API GET. Kısıtlama (rate limit) ve 5xx hatalarında artan beklemeyle en fazla 3 kez yeniden dener. */
async function graph<T>(path: string, params: Record<string, string>, token?: string): Promise<T> {
  const app = metaApp();
  const q = new URLSearchParams(params);
  if (token) {
    q.set("access_token", token);
    // appsecret_proof: token'ın uygulama sırrıyla HMAC-SHA256 özeti ("Require App Secret" açıksa zorunlu).
    if (app) q.set("appsecret_proof", createHmac("sha256", app.appSecret).update(token).digest("hex"));
  }
  const url = path.startsWith("http") ? path : `${GRAPH_URL}${path}?${q}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { cache: "no-store" }).catch((e) => {
      throw new MetaError(`Meta'ya ulaşılamadı: ${e instanceof Error ? e.message : e}`);
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: { message: string; code: number; error_subcode?: number } }) | null;
    const err = json?.error;
    if ((res.status >= 500 || (err && THROTTLE.has(err.code))) && attempt < 3) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    if (!res.ok || !json || err) {
      const code = err?.code, sub = err?.error_subcode;
      if (code === 190) throw new MetaError("Meta oturumunun süresi dolmuş ya da yetki geri alınmış. Hesabı yeniden bağlayın.", code, sub);
      if (code !== undefined && THROTTLE.has(code)) throw new MetaError("Meta istek sınırına ulaşıldı. Birkaç dakika sonra yeniden deneyin.", code, sub);
      if (code === 10 || code === 200) throw new MetaError("Meta bu işlem için izin vermedi (ads_read). Bağlantıyı yeniden kurup izni onaylayın.", code, sub);
      throw new MetaError(`Meta API hatası: ${err?.message ?? `HTTP ${res.status}`}`, code, sub);
    }
    return json;
  }
}

/** Onay kodunu uzun ömürlü (yaklaşık 60 gün) kullanıcı token'ına çevirir. */
export async function metaExchangeCode(code: string) {
  const app = metaApp();
  if (!app) throw new MetaError("Meta uygulama anahtarları tanımlı değil.");
  const short = await graph<{ access_token: string }>("/oauth/access_token", { client_id: app.appId, redirect_uri: app.redirectUri, client_secret: app.appSecret, code });
  const long = await graph<{ access_token: string; expires_in?: number }>("/oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token,
  });
  const me = await graph<{ id: string; name?: string }>("/me", { fields: "id,name" }, long.access_token);
  return { token: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null, userId: me.id, name: me.name ?? null };
}

type RemoteAccount = { id: string; account_id: string; name?: string; currency?: string; timezone_name?: string; account_status?: number };
export const META_ACCOUNT_STATUS: Record<number, string> = {
  1: "Aktif", 2: "Devre dışı", 3: "Ödenmemiş", 7: "Risk incelemesinde", 8: "Ödeme bekliyor", 9: "Ek süre içinde", 100: "Kapanıyor", 101: "Kapalı",
};

/**
 * Bağlantının reklam hesaplarını Meta'dan okuyup kaydeder. Yeni hesaplar seçilmemiş olarak eklenir;
 * Meta'da artık görünmeyen hesaplar silinir (site eşleştirmeleriyle birlikte).
 * Token geçersizse bağlantı "expired" işaretlenir ve kullanıcıya bildirim gider.
 */
export async function syncMetaAccounts(integrationId: string, userId: string) {
  const integ = await db.adIntegration.findFirst({ where: { id: integrationId, userId, provider: "meta" } });
  if (!integ) throw new MetaError("Bağlantı bulunamadı.");
  const token = decrypt(integ.accessTokenEnc);
  const remote: RemoteAccount[] = [];
  try {
    let page = await graph<{ data: RemoteAccount[]; paging?: { next?: string } }>("/me/adaccounts", { fields: "id,account_id,name,currency,timezone_name,account_status", limit: "100" }, token);
    for (let i = 0; i < 50; i++) {
      remote.push(...page.data);
      if (!page.paging?.next) break;
      page = await graph(page.paging.next, {}, undefined);
    }
  } catch (e) {
    await recordFailure(integ, userId, e);
    throw e;
  }
  const seen = new Set<string>();
  for (const a of remote) {
    const externalId = a.account_id || a.id.replace(/^act_/, "");
    seen.add(externalId);
    const data = { name: a.name || `Reklam hesabı ${externalId}`, currency: a.currency ?? null, timezone: a.timezone_name ?? null, status: a.account_status ?? null };
    await db.adAccount.upsert({
      where: { integrationId_externalId: { integrationId: integ.id, externalId } },
      create: { integrationId: integ.id, provider: "meta", externalId, name: data.name, currency: data.currency, timezone: data.timezone, remoteStatus: data.status },
      update: { name: data.name, currency: data.currency, timezone: data.timezone, remoteStatus: data.status },
    });
  }
  await db.adAccount.deleteMany({ where: { integrationId: integ.id, externalId: { notIn: [...seen] } } });
  await db.adIntegration.update({ where: { id: integ.id }, data: { status: "active", lastError: null, lastSyncAt: new Date() } });
  return remote.length;
}

/**
 * Bağlantı hatasını kaydeder. Token geçersizse (190) bağlantı "expired" olur ve kullanıcıya bir kez bildirim gider;
 * sonraki denemeler aynı bildirimi tekrarlamaz.
 */
async function recordFailure(integ: { id: string; status: string; displayName: string | null }, userId: string, e: unknown) {
  if (e instanceof MetaError && e.code === 190) {
    await db.adIntegration.update({ where: { id: integ.id }, data: { status: "expired", lastError: e.message } });
    if (integ.status !== "expired")
      await notify([{ userId, kind: "automation", title: "Meta bağlantısı kesildi", body: `${integ.displayName ?? "Meta"} bağlantısının süresi doldu ya da yetki geri alındı. Reklam verileri güncellenmeyecek; hesabı yeniden bağlayın.`, link: "/reklam-hesaplari" }]);
  } else await db.adIntegration.update({ where: { id: integ.id }, data: { lastError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
}

// ───────────── Reklam verisi (Insights) ─────────────
// Belge: Insights 15 dakikada bir güncellenir ve 28 gün boyunca değişebilir; en fazla 37 ay geriye gidilebilir.
const FIRST_SYNC_DAYS = 90; // ilk çekimde geriye gidilen gün
const REFRESH_DAYS = 28; // sonraki çekimlerde yeniden okunan pencere (veri bu süre içinde değişebilir)
const MIN_INTERVAL_MS = 30 * 60_000; // aynı hesap 30 dakikadan sık çekilmez (zorla yenileme hariç)
// Satın alma eylem türleri, öncelik sırasıyla. Biri bulununca diğerleri toplanmaz (aynı satın alma çift sayılmasın).
const PURCHASE_TYPES = ["omni_purchase", "offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase"];

type ActionStat = { action_type: string; value: string };
type InsightRow = {
  campaign_id: string; campaign_name?: string; date_start: string; spend?: string; impressions?: string; reach?: string; clicks?: string;
  actions?: ActionStat[]; action_values?: ActionStat[]; account_currency?: string;
};
const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
export function purchaseOf(list: ActionStat[] | undefined): number {
  for (const t of PURCHASE_TYPES) {
    const hit = list?.find((a) => a.action_type === t);
    if (hit) return n(hit.value);
  }
  return 0;
}
/** Tarih, reklam hesabının saat dilimine göre (Meta veriyi o saat diliminde raporlar). */
const ymd = (d: Date, tz: string | null) => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz ?? "UTC" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

/**
 * Seçili bir Meta reklam hesabının kampanyalarını ve günlük metriklerini çekip kaydeder.
 * force=false iken son çekimden bu yana 30 dakika geçmediyse API çağrılmaz.
 */
export async function syncMetaMetrics(adAccountId: string, userId: string, force = false) {
  const acc = await db.adAccount.findFirst({ where: { id: adAccountId, provider: "meta", integration: { userId } }, include: { integration: true } });
  if (!acc) throw new MetaError("Reklam hesabı bulunamadı.");
  if (acc.integration.status !== "active") throw new MetaError("Meta bağlantısı aktif değil; hesabı yeniden bağlayın.");
  if (!force && acc.metricsSyncedAt && Date.now() - acc.metricsSyncedAt.getTime() < MIN_INTERVAL_MS) return { skipped: true, rows: 0 };
  const token = decrypt(acc.integration.accessTokenEnc);
  const until = new Date();
  const since = new Date(until.getTime() - (acc.metricsSyncedAt ? REFRESH_DAYS : FIRST_SYNC_DAYS) * 86400000);
  const act = `act_${acc.externalId}`;
  const rows: InsightRow[] = [];
  const campaigns: { id: string; name: string; effective_status?: string; objective?: string }[] = [];
  try {
    let c = await graph<{ data: typeof campaigns; paging?: { next?: string } }>(`/${act}/campaigns`, { fields: "id,name,effective_status,objective", limit: "200" }, token);
    for (let i = 0; i < 50; i++) {
      campaigns.push(...c.data);
      if (!c.paging?.next) break;
      c = await graph(c.paging.next, {});
    }
    let page = await graph<{ data: InsightRow[]; paging?: { next?: string } }>(`/${act}/insights`, {
      level: "campaign", time_increment: "1", limit: "500",
      time_range: JSON.stringify({ since: ymd(since, acc.timezone), until: ymd(until, acc.timezone) }),
      fields: "campaign_id,campaign_name,spend,impressions,reach,clicks,actions,action_values,account_currency",
    }, token);
    for (let i = 0; i < 200; i++) {
      rows.push(...page.data);
      if (!page.paging?.next) break;
      page = await graph(page.paging.next, {});
    }
  } catch (e) {
    await recordFailure(acc.integration, userId, e);
    await db.adAccount.update({ where: { id: acc.id }, data: { metricsError: (e instanceof Error ? e.message : String(e)).slice(0, 500) } });
    throw e;
  }

  // Kampanyalar: liste uç noktasından gelenler ve yalnızca metriklerde görünenler (ör. silinmiş kampanyalar)
  const names = new Map<string, { name: string; status?: string; objective?: string }>();
  for (const c of campaigns) names.set(c.id, { name: c.name, status: c.effective_status, objective: c.objective });
  for (const r of rows) if (!names.has(r.campaign_id)) names.set(r.campaign_id, { name: r.campaign_name ?? r.campaign_id });
  const idOf = new Map<string, string>();
  for (const [externalId, c] of names) {
    const saved = await db.adCampaign.upsert({
      where: { adAccountId_externalId: { adAccountId: acc.id, externalId } },
      create: { adAccountId: acc.id, externalId, name: c.name, status: c.status ?? null, objective: c.objective ?? null },
      update: { name: c.name, ...(c.status ? { status: c.status } : {}), ...(c.objective ? { objective: c.objective } : {}) },
      select: { id: true },
    });
    idOf.set(externalId, saved.id);
  }
  // Pencere içindeki eski satırlar yenileriyle değiştirilir (Meta'da düzeltilen değerler de güncellensin).
  const ops = rows.map((r) => {
    const campaignId = idOf.get(r.campaign_id)!;
    const data = {
      currency: r.account_currency ?? acc.currency, spend: n(r.spend), impressions: Math.round(n(r.impressions)), reach: Math.round(n(r.reach)),
      clicks: Math.round(n(r.clicks)), purchases: purchaseOf(r.actions), purchaseValue: purchaseOf(r.action_values),
    };
    return db.adDailyMetric.upsert({ where: { campaignId_date: { campaignId, date: r.date_start } }, create: { adAccountId: acc.id, campaignId, date: r.date_start, ...data }, update: data });
  });
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  await db.adAccount.update({ where: { id: acc.id }, data: { metricsSyncedAt: new Date(), metricsError: null } });
  return { skipped: false, rows: rows.length };
}

/** Bağlantıyı kaydeder (aynı Meta kullanıcısı yeniden bağlanırsa token yenilenir). */
export async function saveMetaIntegration(userId: string, x: Awaited<ReturnType<typeof metaExchangeCode>>) {
  return db.adIntegration.upsert({
    where: { userId_provider_externalUserId: { userId, provider: "meta", externalUserId: x.userId } },
    create: { userId, provider: "meta", externalUserId: x.userId, displayName: x.name, accessTokenEnc: encrypt(x.token), tokenExpiresAt: x.expiresAt, scopes: META_SCOPES.join(",") },
    update: { displayName: x.name, accessTokenEnc: encrypt(x.token), tokenExpiresAt: x.expiresAt, status: "active", lastError: null, scopes: META_SCOPES.join(",") },
  });
}

/** Meta tarafındaki uygulama iznini geri almayı dener; başarısız olsa da yerel bağlantı silinir. */
export async function revokeMeta(accessTokenEnc: string, externalUserId: string) {
  const app = metaApp();
  const token = decrypt(accessTokenEnc);
  const q = new URLSearchParams({ access_token: token, ...(app ? { appsecret_proof: createHmac("sha256", app.appSecret).update(token).digest("hex") } : {}) });
  await fetch(`${GRAPH_URL}/${encodeURIComponent(externalUserId)}/permissions?${q}`, { method: "DELETE", cache: "no-store" }).catch(() => null);
}
