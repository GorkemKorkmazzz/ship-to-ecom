// T-Soft Admin API (2026-01, JSON:API) adaptörü.
// Kaynak: https://developer.tsoft.com.tr — kimlik doğrulama, ürünler, stok, siparişler sayfaları.
// ÖNEMLİ: Müşteri kişisel veri kapsamları (read_customers, read_customer_personal_data) İSTENMEZ;
// T-Soft bu alanları null döndürür. Adresten yalnızca il/ilçe adı okunur.
//
// GERÇEK MAĞAZADA DOĞRULANACAKLAR (belgede açık değil, sahte API ile sınandı):
//  - Varyantsız ürünün stok kodu alanı (productCode / wsProductCode / barcode sırasıyla denenir)
//  - `GET /catalog/variants` filtresiz çağrının tüm varyantları döndürmesi
//  - Varyant PATCH gövdesinde kaynak türü adının "variants" olması
//  - İndirimi kaldırmak için indirimli fiyata 0 gönderilmesi
//  - Sipariş `createdAt` biçimi (ISO metin ya da Unix saniye; ikisi de okunur)
import type { Store } from "@prisma/client";
import { db } from "../db";
import type { OrderRow, PlatformAdapter, RemoteVariant } from "./types";

const VERSION = "2026-01";
// Adresler yalnızca yerel test (scripts/mock-tsoft.mjs) için ortam değişkeniyle değiştirilebilir.
const API_URL = process.env.TSOFT_API_URL ?? `https://{domain}/api/v3/admin/${VERSION}`;
const TOKEN_URL = process.env.TSOFT_TOKEN_URL ?? "https://login.tsoft360.com/oauth/token";
const INSTALL_URL = process.env.TSOFT_INSTALL_URL ?? "https://api.tsoftapps.com/api/integration/v3/install/app/credentials";
const PANEL_URL = process.env.TSOFT_PANEL_URL ?? "https://tsoftpanel.com/apps/install";

// Uygulamanın istediği izinler. Müşteri verisi kapsamı yok.
export const TSOFT_SCOPES = ["read_products", "write_inventory", "write_product_prices", "read_orders"];

export class TsoftError extends Error {}

/** T-Soft uygulama anahtarları (Partner panelinden alınır). Yoksa T-Soft bağlantısı kapalıdır. */
export function tsoftApp() {
  const clientId = process.env.TSOFT_CLIENT_ID ?? "";
  const clientSecret = process.env.TSOFT_CLIENT_SECRET ?? "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

const reason = (e: unknown) => {
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e));
};

/** Mağaza sahibini T-Soft panelindeki onay ekranına götüren adres. */
export function installUrl(state: string) {
  const app = tsoftApp();
  if (!app) throw new TsoftError("T-Soft uygulama anahtarları tanımlı değil.");
  return `${PANEL_URL}?app=${encodeURIComponent(app.clientId)}&state=${encodeURIComponent(state)}`;
}

/** Onay sonrası gelen tek kullanımlık kodu mağaza kimliğine çevirir. */
export async function exchangeInstallCode(code: string) {
  const app = tsoftApp();
  if (!app) throw new TsoftError("T-Soft uygulama anahtarları tanımlı değil.");
  const res = await fetch(INSTALL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code }),
    cache: "no-store",
  }).catch((e) => {
    throw new TsoftError(`T-Soft'a ulaşılamadı: ${reason(e)}`);
  });
  if (res.status === 401) throw new TsoftError("T-Soft uygulama anahtarını kabul etmedi (TSOFT_CLIENT_SECRET).");
  if (res.status === 400) throw new TsoftError("T-Soft onay kodu geçersiz ya da süresi dolmuş; bağlantıyı yeniden başlatın.");
  if (!res.ok) throw new TsoftError(`T-Soft kurulum hatası (HTTP ${res.status}).`);
  const j = (await res.json()) as { store_id?: string; store_domain?: string; scopes?: string[] };
  if (!j.store_id || !j.store_domain) throw new TsoftError("T-Soft mağaza bilgisi döndürmedi.");
  return { storeId: String(j.store_id), domain: j.store_domain.toLowerCase(), scopes: j.scopes ?? [] };
}

async function getToken(store: Store, force = false): Promise<string> {
  if (!force && store.accessToken && store.tokenExpiresAt && store.tokenExpiresAt.getTime() - Date.now() > 2 * 60_000) return store.accessToken;
  const app = tsoftApp();
  if (!app) throw new TsoftError("T-Soft uygulama anahtarları tanımlı değil (TSOFT_CLIENT_ID / TSOFT_CLIENT_SECRET).");
  if (!store.externalId) throw new TsoftError("T-Soft mağaza kimliği eksik; mağazayı yeniden bağlayın.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: app.clientId, client_secret: app.clientSecret, store: store.externalId, scope: TSOFT_SCOPES.join(" ") }),
    cache: "no-store",
  }).catch((e) => {
    throw new TsoftError(`T-Soft'a ulaşılamadı: ${reason(e)}`);
  });
  if (res.status === 401 || res.status === 403) throw new TsoftError("T-Soft yetki vermedi. Uygulama mağazadan kaldırılmış olabilir; mağazayı yeniden bağlayın.");
  if (!res.ok) throw new TsoftError(`T-Soft yetkilendirme başarısız (HTTP ${res.status}).`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new TsoftError("T-Soft token döndürmedi.");
  const tokenExpiresAt = new Date(Date.now() + (j.expires_in ?? 3600) * 1000);
  await db.store.update({ where: { id: store.id }, data: { accessToken: j.access_token, tokenExpiresAt } });
  store.accessToken = j.access_token;
  store.tokenExpiresAt = tokenExpiresAt;
  return j.access_token;
}

type Resource = { type: string; id: string; attributes?: Record<string, unknown>; relationships?: Record<string, { data?: { type: string; id: string }[] | { type: string; id: string } | null }> };
type Doc = { data?: Resource | Resource[]; included?: Resource[]; links?: { next?: string | null }; meta?: { page?: { currentPage?: number; lastPage?: number } }; errors?: { status?: string; title?: string; detail?: string }[] };

/** Tek istek. 429 ve 5xx'te bekleyip yeniden dener; 401'de token'ı bir kez yeniler. */
async function api(store: Store, method: string, path: string, body?: unknown, plainJson = false): Promise<Doc> {
  const url = API_URL.replace("{domain}", store.storeName) + path;
  let token = await getToken(store);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        ...(body !== undefined ? { "Content-Type": plainJson ? "application/json" : "application/vnd.api+json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).catch((e) => {
      throw new TsoftError(`T-Soft API'sine ulaşılamadı (${store.storeName}): ${reason(e)}`);
    });
    if (res.status === 401 && attempt === 0) {
      token = await getToken(store, true);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = Number(res.headers.get("retry-after")) || attempt + 1;
      await new Promise((r) => setTimeout(r, Math.min(wait, 30) * 1000));
      continue;
    }
    const json = (await res.json().catch(() => null)) as Doc | null;
    if (!res.ok || !json) {
      const msg = json?.errors?.map((e) => e.detail ?? e.title).filter(Boolean).join("; ") || `HTTP ${res.status}`;
      throw new TsoftError(res.status === 403 ? `T-Soft izin vermedi: ${msg}. Uygulama izinlerini T-Soft panelinden onaylayın.` : `T-Soft API hatası: ${msg}`);
    }
    return json;
  }
}

/** Sayfalı listeyi sonuna kadar okur (sayfa başına en fazla 100 kayıt). */
async function list(store: Store, path: string, maxPages = 1000): Promise<{ data: Resource[]; included: Resource[] }> {
  const data: Resource[] = [];
  const included: Resource[] = [];
  const sep = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= maxPages; page++) {
    const d = await api(store, "GET", `${path}${sep}page[size]=100&page[number]=${page}`);
    const rows = Array.isArray(d.data) ? d.data : d.data ? [d.data] : [];
    data.push(...rows);
    included.push(...(d.included ?? []));
    const p = d.meta?.page;
    if (!rows.length || !d.links?.next || (p?.lastPage !== undefined && page >= p.lastPage)) break;
  }
  return { data, included };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
/** İndirimli fiyat: 0, boş ya da satış fiyatından yüksekse "indirim yok" sayılır. */
const discount = (sell: number | null, d: number | null) => (d && sell !== null && d > 0 && d < sell ? d : null);
const toDate = (v: unknown): Date | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;
  if (n !== null) return n > 0 ? new Date(n < 1e12 ? n * 1000 : n) : null;
  const d = typeof v === "string" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

// Varyantsız ürün, tabloda tek satır olarak tutulur; kimliği "p:<ürün>" olur.
const PRODUCT_PREFIX = "p:";

export const tsoftAdapter: PlatformAdapter = {
  id: "tsoft",
  name: "T-Soft",
  host: (store) => store.storeName,

  // Stok, ürün/varyantın `stock` alanından okunur ve aynı alana yazılır (ana depo).
  // Böylece okunan ve yazılan değer her zaman aynı depoya aittir.
  listLocations: async () => [{ id: "main", name: "Ana depo" }],

  async listVariants(store) {
    const [products, variants] = await Promise.all([list(store, "/catalog/products"), list(store, "/catalog/variants")]);
    const byProduct = new Map<string, Resource[]>();
    for (const v of variants.data) {
      const pid = text(v.attributes?.productId);
      if (pid) byProduct.set(pid, [...(byProduct.get(pid) ?? []), v]);
    }
    const out: RemoteVariant[] = [];
    for (const p of products.data) {
      const a = p.attributes ?? {};
      const name = text(a.name) ?? "";
      const subs = byProduct.get(p.id) ?? [];
      if (!subs.length) {
        const sku = text(a.productCode) ?? text(a.wsProductCode) ?? text(a.barcode);
        if (!sku) continue;
        const sell = num(a.price);
        out.push({
          productId: p.id, variantId: PRODUCT_PREFIX + p.id, sku, productName: name, stock: num(a.stock) ?? 0,
          sellPrice: sell, discountPrice: discount(sell, num(a.discountPrice)), buyPrice: num(a.purchasePrice), imageId: null, barcode: text(a.barcode),
        });
        continue;
      }
      for (const v of subs) {
        const s = v.attributes ?? {};
        const sku = text(s.subProductCode);
        if (!sku) continue;
        const sell = num(s.salePrice) ?? num(a.price);
        const variantName = [text(s.typeName1), text(s.typeName2)].filter(Boolean).join(" / ");
        out.push({
          productId: p.id, variantId: v.id, sku, productName: variantName ? `${name} (${variantName})` : name, stock: num(s.stock) ?? 0,
          sellPrice: sell, discountPrice: discount(sell, num(s.salePriceDiscount)), buyPrice: num(s.purchasePrice), imageId: null, barcode: text(s.productBarcode),
        });
      }
    }
    return out;
  },

  async setStocks(store, _locationId, items) {
    // Toplu stok ucu belgelenmemiş; kayıtlar tek tek yazılır. Değer mutlaktır, tekrarı güvenlidir.
    for (const it of items) {
      if (it.variantId.startsWith(PRODUCT_PREFIX))
        await api(store, "PATCH", `/catalog/products/${it.productId}`, { data: { type: "products", id: it.productId, attributes: { stock: it.stockCount } } });
      else await api(store, "PATCH", `/catalog/variants/${it.variantId}`, { data: { type: "variants", id: it.variantId, attributes: { stock: it.stockCount } } });
    }
  },

  async setPrices(store, items) {
    for (const it of items) {
      if (it.variantId.startsWith(PRODUCT_PREFIX))
        await api(store, "PATCH", `/catalog/products/${it.productId}`, {
          data: { type: "products", id: it.productId, attributes: { price: it.sellPrice, discountPrice: it.discountPrice ?? 0, ...(it.buyPrice !== null ? { purchasePrice: it.buyPrice } : {}) } },
        });
      else
        await api(store, "PATCH", `/catalog/variants/${it.variantId}`, {
          data: { type: "variants", id: it.variantId, attributes: { salePrice: it.sellPrice, salePriceDiscount: it.discountPrice ?? 0, ...(it.buyPrice !== null ? { purchasePrice: it.buyPrice } : {}) } },
        });
    }
  },

  async listOrders(store, since) {
    // T-Soft siparişte "şu tarihten beri güncellenen" filtresi sunmuyor; yalnızca sipariş tarihi aralığı var.
    // Durum/kargo değişikliklerini yakalamak için her turda son 30 günün siparişleri yeniden okunur.
    const from = new Date(Math.min(since.getTime(), Date.now() - 30 * 24 * 3600_000)).toISOString().slice(0, 10);
    const [statuses, orders] = await Promise.all([
      list(store, "/order/order-statuses", 10),
      list(store, `/order/orders?filter[placedBetween]=${from},&include=items&sort=-createdAt`, 200),
    ]);
    const statusName = new Map(statuses.data.map((s) => [s.id, text(s.attributes?.name) ?? s.id]));
    const items = new Map(orders.included.filter((r) => r.type === "order-products").map((r) => [r.id, r]));

    // Teslimat adresinden yalnızca il ve ilçe adı alınır.
    const city = new Map<string, { city: string | null; town: string | null }>();
    const ids = orders.data.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 50) {
      const a = await list(store, `/order/order-addresses?filter[orderId]=${ids.slice(i, i + 50).join(",")}`, 20);
      for (const r of a.data) {
        const at = r.attributes ?? {};
        if (String(at.addressType ?? "0") !== "0") continue;
        const oid = text(at.orderId);
        if (oid) city.set(oid, { city: text(at.city), town: text(at.town) });
      }
    }

    const rows: OrderRow[] = [];
    for (const o of orders.data) {
      const a = o.attributes ?? {};
      const rel = o.relationships?.items?.data;
      let lines = (Array.isArray(rel) ? rel : []).map((r) => items.get(r.id)).filter((r): r is Resource => !!r);
      if (!lines.length) lines = (await list(store, `/order/orders/${o.id}/items`, 10)).data;
      const status = statusName.get(String(a.orderStatus)) ?? String(a.orderStatus ?? "");
      const cargoNumber = text(a.cargoNumber);
      const cargoCompany = text(a.cargoCompanyName);
      const orderNumber = text(a.orderNumber) ?? o.id;
      rows.push({
        externalId: o.id,
        data: {
          orderNumber,
          // Raporlar iptal siparişleri "CANCELLED" değeriyle ayıklar; T-Soft durum adları mağazaya özeldir.
          status: /iptal/i.test(status) ? "CANCELLED" : status,
          paymentStatus: null, // T-Soft ödeme durumu alanı sunmuyor (yalnızca ödeme yöntemi)
          packageStatus: null,
          currency: text(a.currency) ?? "TRY",
          totalFinalPrice: num(a.orderTotal) ?? 0,
          orderedAt: toDate(a.createdAt),
          shippingMethod: cargoCompany,
          packages: JSON.stringify(
            cargoNumber ? [{ id: null, number: orderNumber, status: null, lineIds: [], barcode: null, cargoCompany, trackingNumber: cargoNumber, trackingLink: null }] : [],
          ),
          salesChannel: "T-Soft",
          city: city.get(o.id)?.city ?? null,
          district: city.get(o.id)?.town ?? null,
          couponCode: text(a.discountCoupon),
          campaigns: "[]",
        },
        lines: lines.map((l) => {
          const la = l.attributes ?? {};
          const variantName = text(la.variantName);
          return {
            sku: text(la.variantProductCode) ?? text(la.productCode) ?? text(la.barcode) ?? "",
            name: [text(la.productName), variantName ? `(${variantName})` : null].filter(Boolean).join(" "),
            quantity: num(la.quantity) ?? 0,
            finalPrice: num(la.salePrice),
            imageId: null,
            ikasLineId: l.id,
            status: null,
          };
        }),
      });
    }
    return { orders: rows, rich: true };
  },
};
