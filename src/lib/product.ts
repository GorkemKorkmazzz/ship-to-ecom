// Ürün ekleme: tek formdan seçili mağazaların hepsinde aynı ürünü (aynı SKU'larla) oluşturur.
import type { Store } from "@prisma/client";
import { db } from "./db";
import {
  ensureNamed, ensureVariantType, listSalesChannelIds, listStockLocations, sameName,
  saveProduct, setStocks, uploadProductImage, type ImageSource, type VariantTypeRemote,
} from "./ikas";

export type DraftVariant = {
  values: string[]; // variantTypes ile aynı sırada
  sku: string;
  barcode: string;
  sellPrice: number;
  discountPrice: number | null;
  buyPrice: number | null;
  stock: number;
  isActive: boolean;
};

export type ProductDraft = {
  name: string;
  description: string;
  shortDescription: string;
  type: "PHYSICAL" | "DIGITAL";
  brand: string;
  categories: string[];
  tags: string[];
  weight: number | null;
  maxQuantityPerCart: number | null;
  sellIfOutOfStock: boolean;
  publishAllChannels: boolean;
  seo: { slug: string; pageTitle: string; description: string };
  variantTypes: { name: string; values: string[] }[];
  variants: DraftVariant[];
  imageUrls: string[];
  storeIds: string[];
};

export type StoreResult = { store: string; ok: boolean; message: string };

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
  return s
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => map[c])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clean = (a: unknown) => (Array.isArray(a) ? [...new Set(a.map((x) => String(x).trim()).filter(Boolean))] : []);

/** Formdan gelen veriyi doğrular; hata varsa mesaj döner. */
export function validateDraft(raw: unknown): { draft: ProductDraft } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const name = String(r.name ?? "").trim();
  if (!name) return { error: "Ürün adı zorunlu." };
  const variantTypes = (Array.isArray(r.variantTypes) ? r.variantTypes : [])
    .map((t) => ({ name: String(t?.name ?? "").trim(), values: clean(t?.values) }))
    .filter((t) => t.name && t.values.length);
  if (variantTypes.length > 3) return { error: "En fazla 3 varyant tipi eklenebilir." };
  if (new Set(variantTypes.map((t) => t.name.toLocaleLowerCase("tr"))).size !== variantTypes.length)
    return { error: "Varyant tipi adları birbirinden farklı olmalı." };

  const variants: DraftVariant[] = [];
  for (const v of Array.isArray(r.variants) ? r.variants : []) {
    const sku = String(v?.sku ?? "").trim();
    const sellPrice = num(v?.sellPrice);
    const label = sku || (Array.isArray(v?.values) ? v.values.join(" / ") : "") || "ürün";
    if (!sku) return { error: `SKU zorunlu (${label}). Mağazalar arası stok eşleşmesi SKU ile yapılır.` };
    if (sellPrice === null || sellPrice < 0) return { error: `Satış fiyatı geçersiz (${label}).` };
    const discountPrice = num(v?.discountPrice);
    if (discountPrice !== null && (discountPrice < 0 || discountPrice >= sellPrice))
      return { error: `İndirimli fiyat, satış fiyatından düşük olmalı (${label}).` };
    const stock = num(v?.stock) ?? 0;
    if (stock < 0) return { error: `Stok eksi olamaz (${label}).` };
    const values = Array.isArray(v?.values) ? v.values.map((x: unknown) => String(x)) : [];
    if (values.length !== variantTypes.length || values.some((x: string, i: number) => !variantTypes[i].values.includes(x)))
      return { error: "Varyant değerleri varyant tipleriyle uyuşmuyor; sayfayı yenileyip tekrar deneyin." };
    variants.push({
      values, sku, barcode: String(v?.barcode ?? "").trim(), sellPrice, discountPrice,
      buyPrice: num(v?.buyPrice), stock, isActive: v?.isActive !== false,
    });
  }
  if (!variants.length) return { error: "En az bir varyant gerekli." };
  if (variants.length > 100) return { error: "Bir üründe en fazla 100 varyant oluşturulabilir." };
  if (new Set(variants.map((v) => v.sku)).size !== variants.length) return { error: "Her varyantın SKU'su farklı olmalı." };

  const seo = (r.seo ?? {}) as Record<string, unknown>;
  const storeIds = clean(r.storeIds);
  if (!storeIds.length) return { error: "En az bir mağaza seçin." };
  const imageUrls = clean(r.imageUrls);
  if (imageUrls.some((u) => !/^https?:\/\//i.test(u))) return { error: "Görsel adresleri http(s):// ile başlamalı." };

  return {
    draft: {
      name,
      description: String(r.description ?? "").trim(),
      shortDescription: String(r.shortDescription ?? "").trim(),
      type: r.type === "DIGITAL" ? "DIGITAL" : "PHYSICAL",
      brand: String(r.brand ?? "").trim(),
      categories: clean(r.categories),
      tags: clean(r.tags),
      weight: num(r.weight),
      maxQuantityPerCart: num(r.maxQuantityPerCart),
      sellIfOutOfStock: r.sellIfOutOfStock === true,
      publishAllChannels: r.publishAllChannels !== false,
      seo: {
        slug: slugify(String(seo.slug ?? "")),
        pageTitle: String(seo.pageTitle ?? "").trim(),
        description: String(seo.description ?? "").trim(),
      },
      variantTypes, variants, imageUrls, storeIds,
    },
  };
}

/** Ürünü tek bir mağazada oluşturur. Uyarıları (ör. görsel yüklenemedi) döner. */
export async function createInStore(store: Store, d: ProductDraft, images: ImageSource[]): Promise<string[]> {
  const warnings: string[] = [];
  let locationId = store.stockLocationId;
  if (!locationId) {
    const locs = await listStockLocations(store);
    if (!locs.length) throw new Error("Mağazada stok lokasyonu bulunamadı.");
    locationId = locs[0].id;
    await db.store.update({ where: { id: store.id }, data: { stockLocationId: locationId } });
  }

  const [brandIds, categoryIds, tagIds] = [
    await ensureNamed(store, "brand", d.brand ? [d.brand] : []),
    await ensureNamed(store, "category", d.categories),
    await ensureNamed(store, "tag", d.tags),
  ];
  const types: VariantTypeRemote[] = [];
  for (const t of d.variantTypes) types.push(await ensureVariantType(store, t.name, t.values));
  const valueId = (ti: number, value: string) => {
    const hit = types[ti].values.find((x) => sameName(x.name, value));
    if (!hit) throw new Error(`Varyant değeri oluşturulamadı: ${value}`);
    return hit.id;
  };

  const hasSeo = d.seo.slug || d.seo.pageTitle || d.seo.description;
  const input: Record<string, unknown> = {
    name: d.name,
    type: d.type,
    ...(d.description ? { description: d.description } : {}),
    ...(d.shortDescription ? { shortDescription: d.shortDescription } : {}),
    ...(brandIds.length ? { brandId: brandIds[0] } : {}),
    ...(categoryIds.length ? { categoryIds } : {}),
    ...(tagIds.length ? { tagIds } : {}),
    ...(d.weight !== null ? { weight: d.weight } : {}),
    ...(d.maxQuantityPerCart !== null ? { maxQuantityPerCart: d.maxQuantityPerCart } : {}),
    ...(d.publishAllChannels ? { salesChannelIds: await listSalesChannelIds(store) } : {}),
    ...(hasSeo
      ? {
          metaData: {
            slug: d.seo.slug || slugify(d.name),
            ...(d.seo.pageTitle ? { pageTitle: d.seo.pageTitle } : {}),
            ...(d.seo.description ? { description: d.seo.description } : {}),
          },
        }
      : {}),
    ...(types.length
      ? {
          productVariantTypes: types.map((t, i) => ({
            order: i,
            variantTypeId: t.id,
            variantValueIds: d.variantTypes[i].values.map((v) => valueId(i, v)),
          })),
        }
      : {}),
    variants: d.variants.map((v) => ({
      sku: v.sku,
      isActive: v.isActive,
      sellIfOutOfStock: d.sellIfOutOfStock,
      ...(v.barcode ? { barcodeList: [v.barcode] } : {}),
      ...(d.weight !== null ? { weight: d.weight } : {}),
      prices: [
        {
          sellPrice: v.sellPrice,
          ...(v.discountPrice !== null ? { discountPrice: v.discountPrice } : {}),
          ...(v.buyPrice !== null ? { buyPrice: v.buyPrice } : {}),
        },
      ],
      ...(types.length
        ? { variantValueIds: v.values.map((val, i) => ({ variantTypeId: types[i].id, variantValueId: valueId(i, val) })) }
        : {}),
    })),
  };

  const saved = await saveProduct(store, input);

  // Stok, ürün oluştuktan sonra ayrı çağrıyla yazılır (ikas'ta varyant girdisinde stok alanı yok).
  const stocks = [];
  for (const v of d.variants) {
    const hit = saved.variants.find((x) => x.sku === v.sku);
    if (!hit) {
      warnings.push(`${v.sku}: oluşturulan varyant bulunamadı, stok yazılamadı.`);
      continue;
    }
    stocks.push({ productId: saved.id, variantId: hit.id, stockCount: v.stock });
  }
  try {
    if (stocks.length) await setStocks(store, locationId, stocks);
  } catch (e) {
    warnings.push(`Stok yazılamadı: ${e instanceof Error ? e.message : e}`);
  }

  const variantIds = saved.variants.map((v) => v.id);
  for (let i = 0; i < images.length; i++) {
    try {
      await uploadProductImage(store, variantIds, images[i], i);
    } catch (e) {
      warnings.push(`${i + 1}. görsel: ${e instanceof Error ? e.message : e}`);
    }
  }
  return warnings;
}

// ───────────── Ürünü diğer mağazaya kopyalama ─────────────
import { getProductFull } from "./ikas";
import { imageUrl } from "./pricing";

export async function copyProduct(source: Store, target: Store, productId: string): Promise<string[]> {
  const full = await getProductFull(source, productId);
  if (full.partial && full.variants.length > 1)
    throw new Error("Varyant bilgileri kaynak mağazadan okunamadı; varyantlı ürün kopyalanamıyor.");
  if (full.variants.some((v) => !v.sku?.trim())) throw new Error("Üründe SKU'su boş varyant var; önce ikas'ta SKU girin.");

  const typeNames: string[] = [];
  for (const v of full.variants) for (const x of v.variantValues ?? []) if (x.variantTypeName && !typeNames.includes(x.variantTypeName)) typeNames.push(x.variantTypeName);
  const valueOf = (v: FullVariant, type: string) => v.variantValues?.find((x) => x.variantTypeName === type)?.variantValueName ?? "";
  type FullVariant = (typeof full.variants)[number];
  const variantTypes = typeNames.map((name) => ({ name, values: [...new Set(full.variants.map((v) => valueOf(v, name)).filter(Boolean))] }));
  if (full.variants.length > 1 && !variantTypes.length) throw new Error("Varyant tipleri okunamadı; ürün kopyalanamıyor.");

  const imageIds: string[] = [];
  for (const v of full.variants)
    for (const im of [...(v.images ?? [])].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.order - b.order))
      if (im.imageId && !imageIds.includes(im.imageId)) imageIds.push(im.imageId);

  const draft: ProductDraft = {
    name: full.name,
    description: full.description ?? "",
    shortDescription: full.shortDescription ?? "",
    type: full.type === "DIGITAL" ? "DIGITAL" : "PHYSICAL",
    brand: full.brand?.name ?? "",
    categories: (full.categories ?? []).map((c) => c.name),
    tags: (full.tags ?? []).map((t) => t.name),
    weight: full.weight ?? null,
    maxQuantityPerCart: null,
    sellIfOutOfStock: false,
    publishAllChannels: true,
    seo: { slug: "", pageTitle: "", description: "" },
    variantTypes,
    variants: full.variants.map((v) => {
      const price = v.prices?.find((x) => !x.priceListId) ?? v.prices?.[0];
      return {
        values: typeNames.map((t) => valueOf(v, t)),
        sku: v.sku!.trim(),
        barcode: v.barcodeList?.find((b) => b?.trim())?.trim() ?? "",
        sellPrice: price?.sellPrice ?? 0,
        discountPrice: price?.discountPrice ?? null,
        buyPrice: price?.buyPrice ?? null,
        stock: v.stocks?.find((x) => x.stockLocationId === source.stockLocationId)?.stockCount ?? 0,
        isActive: v.isActive !== false,
      };
    }),
    imageUrls: [],
    storeIds: [target.id],
  };
  const images = imageIds.slice(0, 10).flatMap((id) => {
    const url = imageUrl(source.merchantId, id, 1080);
    return url ? [{ url }] : [];
  });
  const warnings = await createInStore(target, draft, images);
  if (full.partial) warnings.push("Marka, kategori ve açıklama kaynak mağazadan okunamadı; yalnızca temel bilgiler kopyalandı.");
  return warnings;
}
