// Ürün maliyet geçmişi ve sipariş kalemi maliyet snapshot'ı.
// Kurallar:
//  - Maliyet bir dönem için geçerlidir [validFrom, validTo). Değişince eski kayıt kapanır, yeni kayıt açılır; geçmiş kayıt değişmez.
//  - ikas alış fiyatı ilk görüldüğünde kayıt "şimdi"den başlar; geçmişe taşınmaz. Geçmiş maliyeti yalnızca kullanıcı elle girebilir.
//  - Elle girilen (MANUAL) açık kayıt varsa ikas alış fiyatı onu ezmez.
//  - Sipariş kalemine, sipariş anında geçerli maliyet bir kez yazılır (snapshot) ve sonraki senkronlarda korunur.
//  - Maliyetin para birimi bilinmiyorsa (null) farklı para birimindeki satışa uygulanmaz.
import { db } from "../db";

import { indexCosts, type CostEntry } from "./cost-core";
export { applicable, costAt, indexCosts, snapshotFor, type CostEntry } from "./cost-core";

export async function loadCosts(userId: string, storeIds: string[]) {
  if (!storeIds.length) return new Map<string, CostEntry[]>();
  const rows = await db.productCostHistory.findMany({ where: { userId, storeId: { in: storeIds } }, select: { storeId: true, sku: true, unitCost: true, currency: true, validFrom: true, validTo: true, source: true } });
  return indexCosts(rows);
}

/** Mağazanın para birimi: siparişleri tek para birimindeyse o; değilse ya da sipariş yoksa null (varsayım yapılmaz). */
export async function storeCurrency(storeId: string) {
  const cur = await db.order.findMany({ where: { storeId }, distinct: ["currency"], select: { currency: true }, take: 2 });
  return cur.length === 1 ? cur[0].currency : null;
}

/**
 * ikas alış fiyatlarını maliyet geçmişine işler (senkron sırasında). Değişmeyen fiyat için yazım yapılmaz.
 * buyPrice null olursa açık ikas kaydı kapanır (o andan sonra maliyet bilinmiyor).
 */
export async function trackBuyPrices(userId: string, storeId: string, variants: { sku: string; productId: string; buyPrice: number | null; duplicateSku: boolean }[], now = new Date()) {
  const open = await db.productCostHistory.findMany({ where: { storeId, validTo: null } });
  const openOf = new Map(open.map((o) => [o.sku, o]));
  const currency = await storeCurrency(storeId);
  const ops = [];
  const seen = new Set<string>();
  for (const v of variants) {
    if (v.duplicateSku || !v.sku || seen.has(v.sku)) continue; // aynı SKU birden çok varyantta: hangi fiyatın geçerli olduğu belirsiz
    seen.add(v.sku);
    const cur = openOf.get(v.sku);
    if (cur?.source === "MANUAL") continue;
    if (v.buyPrice === null) {
      if (cur) ops.push(db.productCostHistory.update({ where: { id: cur.id }, data: { validTo: now } }));
      continue;
    }
    if (cur && cur.unitCost === v.buyPrice) {
      // Maliyet aynı; para birimi önceden belirlenemediyse (yeni mağaza, henüz sipariş yok) şimdi doldurulur. Tutar değişmez.
      if (!cur.currency && currency) ops.push(db.productCostHistory.update({ where: { id: cur.id }, data: { currency, note: "Para birimi sonradan mağaza siparişlerinden belirlendi." } }));
      continue;
    }
    if (cur) ops.push(db.productCostHistory.update({ where: { id: cur.id }, data: { validTo: now } }));
    ops.push(db.productCostHistory.create({ data: { userId, storeId, sku: v.sku, productId: v.productId, unitCost: v.buyPrice, purchaseCost: v.buyPrice, currency, validFrom: now, source: "IKAS_BUY_PRICE", note: currency ? null : "Para birimi belirlenemedi (mağazada sipariş yok ya da birden fazla para birimi var)." } }));
  }
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  return ops.length;
}

export type ManualCost = { storeId: string; sku: string; validFrom: Date; currency: string; purchaseCost: number; productionCost?: number | null; packagingCost?: number | null; labelCost?: number | null; otherCost?: number | null; note?: string | null };
/**
 * Elle maliyet girişi (geçmişe dönük de olabilir). Girilen tarih bir dönemin içine düşerse o dönem ikiye bölünür:
 * önceki kısım validFrom'da kapanır, yeni kayıt bir sonraki kaydın başlangıcına kadar geçerli olur. Mevcut kayıtlar silinmez.
 * Daha önce snapshot alınmış sipariş kalemleri değişmez (geçmiş siparişin maliyeti geriye dönük değişmemeli).
 */
export async function addManualCost(userId: string, c: ManualCost) {
  const parts = [c.purchaseCost, c.productionCost ?? 0, c.packagingCost ?? 0, c.labelCost ?? 0, c.otherCost ?? 0];
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) throw new Error("Maliyet bileşenleri sıfır ya da pozitif sayı olmalı.");
  const unitCost = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;
  const store = await db.store.findFirst({ where: { id: c.storeId, userId }, select: { id: true } });
  if (!store) throw new Error("Mağaza bulunamadı.");
  const rows = await db.productCostHistory.findMany({ where: { storeId: c.storeId, sku: c.sku }, orderBy: { validFrom: "asc" } });
  // Aynı gün (Türkiye saati) için ikinci kayıt sıfır uzunlukta dönem üretir; reddedilir.
  const trDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
  if (rows.some((r) => trDay(r.validFrom) === trDay(c.validFrom))) throw new Error("Bu tarihte başlayan bir maliyet kaydı zaten var.");
  const containing = rows.find((r) => r.validFrom < c.validFrom && (!r.validTo || c.validFrom < r.validTo));
  const next = rows.find((r) => r.validFrom > c.validFrom);
  await db.$transaction([
    ...(containing ? [db.productCostHistory.update({ where: { id: containing.id }, data: { validTo: c.validFrom } })] : []),
    db.productCostHistory.create({ data: {
      userId, storeId: c.storeId, sku: c.sku, unitCost, currency: c.currency, validFrom: c.validFrom, validTo: next?.validFrom ?? (containing?.validTo ?? null),
      purchaseCost: c.purchaseCost, productionCost: c.productionCost ?? null, packagingCost: c.packagingCost ?? null, labelCost: c.labelCost ?? null, otherCost: c.otherCost ?? null,
      source: "MANUAL", note: c.note ?? null,
    } }),
  ]);
  return unitCost;
}

