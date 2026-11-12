// ikas Admin API istemcisi (private app / client_credentials).
// ÖNEMLİ: Buradaki sorgular müşteri, adres, e-posta, telefon alanlarını HİÇ istemez;
// bu veriler platforma hiç ulaşmaz.
import type { Store } from "@prisma/client";
import { decrypt } from "./crypto";
import { db } from "./db";

// Adresler yalnızca yerel test (scripts/mock-ikas.mjs) için ortam değişkeniyle değiştirilebilir.
const GRAPHQL_URL = process.env.IKAS_GRAPHQL_URL ?? "https://api.myikas.com/api/v1/admin/graphql";
const TOKEN_URL = process.env.IKAS_TOKEN_URL ?? "https://{store}.myikas.com/api/admin/oauth/token";

export class IkasError extends Error {}

function networkReason(e: unknown): string {
  const cause = (e as { cause?: { code?: string; message?: string } })?.cause;
  return cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e));
}

export function normalizeStoreName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.myikas\.com.*$/, "")
    .replace(/\/.*$/, "");
}

export async function fetchToken(storeName: string, clientId: string, clientSecret: string) {
  const url = TOKEN_URL.replace("{store}", storeName);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  }).catch((e) => {
    throw new IkasError(`ikas'a ulaşılamadı (${new URL(url).host}): ${networkReason(e)}`);
  });
  if (res.status === 401 || res.status === 403)
    throw new IkasError("ikas bu bilgileri kabul etmedi. Mağaza adı, Client ID ve Client Secret'ı kontrol edin.");
  if (!res.ok) throw new IkasError(`ikas yetkilendirme başarısız (HTTP ${res.status}).`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new IkasError("ikas token döndürmedi.");
  return { accessToken: json.access_token, expiresIn: json.expires_in ?? 14400 };
}

async function getToken(store: Store): Promise<string> {
  if (store.accessToken && store.tokenExpiresAt && store.tokenExpiresAt.getTime() - Date.now() > 5 * 60_000) {
    return store.accessToken;
  }
  const t = await fetchToken(store.storeName, store.clientId, decrypt(store.clientSecretEnc));
  const tokenExpiresAt = new Date(Date.now() + t.expiresIn * 1000);
  await db.store.update({ where: { id: store.id }, data: { accessToken: t.accessToken, tokenExpiresAt } });
  store.accessToken = t.accessToken;
  store.tokenExpiresAt = tokenExpiresAt;
  return t.accessToken;
}

async function gql<T>(store: Store, query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = await getToken(store);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    }).catch((e) => {
      throw new IkasError(`ikas API'sine ulaşılamadı: ${networkReason(e)}`);
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    const json = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
    if (!res.ok || !json || json.errors?.length || !json.data) {
      const msg = json?.errors?.map((e) => e.message).join("; ") ?? `HTTP ${res.status}`;
      throw new IkasError(`ikas API hatası: ${msg}`);
    }
    return json.data;
  }
}

export type StockLocation = { id: string; name: string };

export async function listStockLocations(store: Store): Promise<StockLocation[]> {
  const d = await gql<{ listStockLocation: StockLocation[] }>(store, `{ listStockLocation { id name } }`);
  return d.listStockLocation;
}

export type RemoteVariant = {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  stock: number;
  sellPrice: number | null;
  discountPrice: number | null;
  buyPrice: number | null;
  imageId: string | null;
  barcode: string | null;
};

/** Mağazadaki SKU'lu tüm varyantları; seçili lokasyondaki stok, varsayılan fiyat ve ana görselle getirir. */
export async function listVariants(store: Store, stockLocationId: string): Promise<RemoteVariant[]> {
  type Resp = {
    listProduct: {
      hasNext: boolean;
      data: {
        id: string;
        name: string;
        variants: {
          id: string;
          sku: string | null;
          barcodeList: string[] | null;
          stocks: { stockLocationId: string; stockCount: number }[] | null;
          prices: { sellPrice: number; discountPrice: number | null; buyPrice: number | null; priceListId: string | null }[] | null;
          images: { imageId: string | null; isMain: boolean; order: number }[] | null;
        }[];
      }[];
    };
  };
  const out: RemoteVariant[] = [];
  for (let page = 1; page <= 500; page++) {
    const d = await gql<Resp>(
      store,
      `query($page: Int!) {
        listProduct(pagination: { limit: 100, page: $page }) {
          hasNext
          data {
            id name
            variants {
              id sku barcodeList
              stocks { stockLocationId stockCount }
              prices { sellPrice discountPrice buyPrice priceListId }
              images { imageId isMain order }
            }
          }
        }
      }`,
      { page },
    );
    for (const p of d.listProduct.data) {
      for (const v of p.variants) {
        const sku = v.sku?.trim();
        if (!sku) continue;
        const stock = v.stocks?.find((s) => s.stockLocationId === stockLocationId)?.stockCount ?? 0;
        // Varsayılan fiyat: bir fiyat listesine bağlı olmayan kayıt.
        const price = v.prices?.find((x) => !x.priceListId) ?? v.prices?.[0];
        const images = [...(v.images ?? [])].sort((a, b) => a.order - b.order);
        const image = images.find((i) => i.isMain) ?? images[0];
        out.push({
          productId: p.id, variantId: v.id, sku, productName: p.name, stock,
          sellPrice: price?.sellPrice ?? null,
          discountPrice: price?.discountPrice ?? null,
          buyPrice: price?.buyPrice ?? null,
          imageId: image?.imageId ?? null,
          barcode: v.barcodeList?.find((b) => b?.trim())?.trim() ?? null,
        });
      }
    }
    if (!d.listProduct.hasNext) break;
  }
  return out;
}

export type PriceWrite = { productId: string; variantId: string; sellPrice: number; discountPrice: number | null; buyPrice: number | null };

export async function setPrices(store: Store, items: PriceWrite[]) {
  for (let i = 0; i < items.length; i += 500) {
    const variantPriceInputs = items.slice(i, i + 500).map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      price: { sellPrice: it.sellPrice, discountPrice: it.discountPrice, buyPrice: it.buyPrice },
    }));
    await gql(store, `mutation($input: SaveVariantPricesInput!) { saveVariantPrices(input: $input) }`, { input: { variantPriceInputs } });
  }
}

export async function getMerchantId(store: Store): Promise<string> {
  const d = await gql<{ getMerchant: { id: string } }>(store, `{ getMerchant { id } }`);
  return d.getMerchant.id;
}

export async function setStocks(
  store: Store,
  stockLocationId: string,
  items: { productId: string; variantId: string; stockCount: number }[],
) {
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50).map((it) => ({ ...it, stockLocationId }));
    await gql(
      store,
      `mutation($input: SaveStockLocationsInput!) { saveProductStockLocations(input: $input) }`,
      { input: { productStockLocationInputs: chunk } },
    );
  }
}

export type RemoteOrder = {
  id: string;
  orderNumber: string | null;
  status: string;
  orderPaymentStatus: string | null;
  orderPackageStatus: string | null;
  currencyCode: string;
  totalFinalPrice: number;
  orderedAt: number | null;
  shippingMethod: string | null;
  orderPackages:
    | {
        orderPackageNumber: string;
        trackingInfo: { barcode: string | null; cargoCompany: string | null; trackingNumber: string | null; trackingLink: string | null } | null;
      }[]
    | null;
  orderLineItems: {
    quantity: number;
    finalPrice: number | null;
    variant: { name: string | null; sku: string | null; mainImageId: string | null };
  }[];
};

/** Siparişleri getirir. Müşteri/adres alanları sorguda yoktur. */
export async function listOrders(store: Store, updatedSince: Date): Promise<RemoteOrder[]> {
  type Resp = { listOrder: { hasNext: boolean; data: RemoteOrder[] } };
  const since = Math.floor(updatedSince.getTime());
  const out: RemoteOrder[] = [];
  for (let page = 1; page <= 500; page++) {
    const d = await gql<Resp>(
      store,
      `query($page: Int!) {
        listOrder(pagination: { limit: 50, page: $page }, updatedAt: { gte: ${since} }) {
          hasNext
          data {
            id orderNumber status orderPaymentStatus orderPackageStatus
            currencyCode totalFinalPrice orderedAt shippingMethod
            orderPackages { orderPackageNumber trackingInfo { barcode cargoCompany trackingNumber trackingLink } }
            orderLineItems { quantity finalPrice variant { name sku mainImageId } }
          }
        }
      }`,
      { page },
    );
    out.push(...d.listOrder.data);
    if (!d.listOrder.hasNext) break;
  }
  return out;
}

const WEBHOOK_SCOPES = ["store/order/created", "store/order/updated", "store/stock/updated"];

export async function registerWebhooks(store: Store, endpoint: string) {
  await gql(store, `mutation($input: WebhookInput!) { saveWebhook(input: $input) { id } }`, {
    input: { endpoint, scopes: WEBHOOK_SCOPES },
  });
}

// ───────────────────────── Ürün oluşturma ─────────────────────────

const IMAGE_URL = process.env.IKAS_IMAGE_URL ?? "https://api.myikas.com/api/v1/admin/product/upload/image";

export type Named = { id: string; name: string };
type Kind = "brand" | "category" | "tag";
const KIND = {
  brand: { list: "listProductBrand", save: "saveProductBrand", input: "ProductBrandInput" },
  category: { list: "listCategory", save: "saveCategory", input: "CategoryInput" },
  tag: { list: "listProductTag", save: "saveProductTag", input: "ProductTagInput" },
} as const;

export const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase("tr") === b.trim().toLocaleLowerCase("tr");

export async function listNamed(store: Store, kind: Kind): Promise<Named[]> {
  const k = KIND[kind];
  const d = await gql<Record<string, Named[]>>(store, `{ ${k.list} { id name } }`);
  return d[k.list];
}

/** Adı verilen marka/kategori/etiketleri mağazada bulur, yoksa oluşturur; id'lerini döner. */
export async function ensureNamed(store: Store, kind: Kind, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const k = KIND[kind];
  const existing = await listNamed(store, kind);
  const ids: string[] = [];
  for (const name of names) {
    let hit = existing.find((e) => sameName(e.name, name));
    if (!hit) {
      const d = await gql<Record<string, Named>>(
        store,
        `mutation($input: ${k.input}!) { ${k.save}(input: $input) { id name } }`,
        { input: { name } },
      );
      hit = d[k.save];
      existing.push(hit);
    }
    ids.push(hit.id);
  }
  return ids;
}

export type VariantTypeRemote = { id: string; name: string; selectionType: string; values: Named[] };

/** Varyant tipini (örn. Beden) ve değerlerini (S, M, L) mağazada bulur/oluşturur. */
export async function ensureVariantType(store: Store, name: string, values: string[]): Promise<VariantTypeRemote> {
  const fields = `id name selectionType values { id name }`;
  const all = (await gql<{ listVariantType: VariantTypeRemote[] }>(store, `{ listVariantType { ${fields} } }`)).listVariantType;
  const hit = all.find((t) => sameName(t.name, name));
  const missing = values.filter((v) => !hit?.values.some((x) => sameName(x.name, v)));
  if (hit && !missing.length) return hit;
  const input = {
    ...(hit ? { id: hit.id } : {}),
    name: hit?.name ?? name,
    // Not: "CHOICE" değeri dokümanda doğrulanamadı (metin "choice or color" diyor).
    selectionType: hit?.selectionType ?? "CHOICE",
    values: [...(hit?.values.map((v) => ({ id: v.id, name: v.name })) ?? []), ...missing.map((v) => ({ name: v }))],
  };
  const d = await gql<{ saveVariantType: VariantTypeRemote }>(
    store,
    `mutation($input: VariantTypeInput!) { saveVariantType(input: $input) { ${fields} } }`,
    { input },
  );
  return d.saveVariantType;
}

export async function listSalesChannelIds(store: Store): Promise<string[]> {
  const d = await gql<{ listSalesChannel: { id: string }[] }>(store, `{ listSalesChannel { id } }`);
  return d.listSalesChannel.map((c) => c.id);
}

export type SavedProduct = { id: string; variants: { id: string; sku: string | null }[] };

export async function saveProduct(store: Store, input: Record<string, unknown>): Promise<SavedProduct> {
  const d = await gql<{ saveProduct: SavedProduct }>(
    store,
    `mutation($input: ProductInput!) { saveProduct(input: $input) { id variants { id sku } } }`,
    { input },
  );
  return d.saveProduct;
}

export type ImageSource = { url: string } | { base64: string };

export async function uploadProductImage(store: Store, variantIds: string[], image: ImageSource, order: number) {
  const token = await getToken(store);
  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ productImage: { variantIds, order, isMain: order === 0, ...image } }),
    cache: "no-store",
  }).catch((e) => {
    throw new IkasError(`Görsel yüklenemedi: ${networkReason(e)}`);
  });
  if (!res.ok) throw new IkasError(`Görsel yüklenemedi (HTTP ${res.status}).`);
}

// ───────────────────────── Kampanyalar (indirimler) ─────────────────────────

export type CampaignType = "RATIO" | "FIXED_AMOUNT" | "FREE_SHIPPING" | "BUY_X_THEN_GET_Y";
export type RemoteCampaign = {
  id: string;
  title: string;
  type: CampaignType;
  hasCoupon: boolean;
  usageCount: number;
  usageLimit: number | null;
  dateRange: { start: number | null; end: number | null } | null;
  fixedDiscount: { amount: number | null } | null;
};

export async function listCampaigns(store: Store): Promise<RemoteCampaign[]> {
  type Resp = { listCampaign: { hasNext: boolean; data: RemoteCampaign[] } };
  const out: RemoteCampaign[] = [];
  for (let page = 1; page <= 20; page++) {
    const d = await gql<Resp>(
      store,
      `query($page: Int!) {
        listCampaign(pagination: { limit: 100, page: $page }) {
          hasNext
          data { id title type hasCoupon usageCount usageLimit dateRange { start end } fixedDiscount { amount } }
        }
      }`,
      { page },
    );
    out.push(...d.listCampaign.data);
    if (!d.listCampaign.hasNext) break;
  }
  return out;
}

export async function saveCampaign(store: Store, input: Record<string, unknown>): Promise<string> {
  const d = await gql<{ saveCampaign: { id: string } }>(
    store,
    `mutation($input: CampaignInput!) { saveCampaign(input: $input) { id } }`,
    { input },
  );
  return d.saveCampaign.id;
}

export async function addCoupon(store: Store, campaignId: string, code: string, canCombineWithOtherCampaigns: boolean) {
  await gql(store, `mutation($input: AddCouponsInput!) { campaignAddCoupons(input: $input) { id } }`, {
    input: { campaignId, coupons: [{ code, canCombineWithOtherCampaigns }] },
  });
}

export async function deleteCampaigns(store: Store, idList: string[]) {
  await gql(store, `mutation($idList: [String!]!) { deleteCampaignList(idList: $idList) }`, { idList });
}

// ───────────────────────── Ürün okuma (kopyalama için) ─────────────────────────

export type FullProduct = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  shortDescription: string | null;
  weight: number | null;
  brand: { name: string } | null;
  categories: { name: string }[] | null;
  tags: { name: string }[] | null;
  variants: {
    id: string;
    sku: string | null;
    isActive: boolean | null;
    barcodeList: string[] | null;
    prices: { sellPrice: number; discountPrice: number | null; buyPrice: number | null; priceListId: string | null }[] | null;
    images: { imageId: string | null; isMain: boolean; order: number }[] | null;
    variantValues: { variantTypeName: string | null; variantValueName: string | null }[] | null;
    stocks: { stockLocationId: string; stockCount: number }[] | null;
  }[];
  /** Zengin sorgu başarısız olduysa true: marka/kategori/varyant değerleri okunamadı. */
  partial: boolean;
};

export async function getProductFull(store: Store, productId: string): Promise<FullProduct> {
  const variantCore = `id sku isActive barcodeList prices { sellPrice discountPrice buyPrice priceListId } images { imageId isMain order } stocks { stockLocationId stockCount }`;
  const run = (fields: string) =>
    gql<{ listProduct: { data: FullProduct[] } }>(
      store,
      `query($id: String!) { listProduct(id: { eq: $id }, pagination: { limit: 1, page: 1 }) { data { ${fields} } } }`,
      { id: productId },
    );
  let partial = false;
  let d;
  try {
    d = await run(`id name type description shortDescription weight brand { name } categories { name } tags { name } variants { ${variantCore} variantValues { variantTypeName variantValueName } }`);
  } catch {
    // Bazı alanlar bu mağazanın API sürümünde yoksa çekirdek alanlarla tekrar dene.
    partial = true;
    d = await run(`id name type variants { ${variantCore} }`);
  }
  const p = d.listProduct.data[0];
  if (!p) throw new IkasError("Ürün kaynak mağazada bulunamadı.");
  return { ...p, partial };
}
