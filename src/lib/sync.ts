import type { Store, StoreVariant } from "@prisma/client";
import { invalidateUser } from "./cache";
import { db } from "./db";
import { getMerchantId, listAbandonedCheckouts, listOrders, listStockLocations, listVariants, setPrices, setStocks, type PriceWrite, type RemoteVariant } from "./ikas";
import { applyRule } from "./pricing";
import { publish, reconcile } from "./reconcile";

// Aynı kullanıcı için eşzamanlı iki senkron çalışmaz. Çalışırken gelen istek,
// bittikten sonra bir tur daha çalıştırır. (Tek sunucu örneği varsayar; birden fazla
// örnekle yayına alınırsa veritabanı kilidine çevrilmeli.)
const running = new Map<string, Promise<void>>();
const rerun = new Set<string>();

export function syncUser(userId: string): Promise<void> {
  const active = running.get(userId);
  if (active) {
    rerun.add(userId);
    return active;
  }
  const p = (async () => {
    try {
      do {
        rerun.delete(userId);
        await runSync(userId);
      } while (rerun.has(userId));
    } finally {
      running.delete(userId);
      // Senkron veriyi değiştirdi: rapor/pano önbelleği hemen düşer.
      invalidateUser(userId);
    }
  })();
  running.set(userId, p);
  return p;
}

type Log = { level: string; message: string; sku?: string; storeLabel?: string };

async function runSync(userId: string) {
  const stores = await db.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const logs: Log[] = [];
  const loaded: { store: Store; locationId: string; rows: Map<string, StoreVariant> }[] = [];

  for (const store of stores) {
    try {
      let locationId = store.stockLocationId;
      if (!locationId) {
        const locs = await listStockLocations(store);
        if (!locs.length) throw new Error("Mağazada stok lokasyonu bulunamadı.");
        locationId = locs[0].id;
        await db.store.update({ where: { id: store.id }, data: { stockLocationId: locationId } });
      }
      if (!store.merchantId) {
        // Görsel adresleri için gerekli; alınamazsa senkronu durdurmaz.
        const merchantId = await getMerchantId(store).catch(() => null);
        if (merchantId) {
          await db.store.update({ where: { id: store.id }, data: { merchantId } });
          store.merchantId = merchantId;
        }
      }
      const remote = await listVariants(store, locationId);
      const rows = await saveVariants(store, remote, logs);
      loaded.push({ store, locationId, rows });
    } catch (e) {
      await fail(store, e, logs);
    }
  }

  // Ortak stok yalnızca tüm mağazalar başarıyla okunduysa hesaplanır;
  // biri okunamadıysa eksik veriyle stok yazmak tehlikeli olur.
  if (stores.length >= 2 && loaded.length === stores.length) {
    await reconcileStocks(userId, loaded, logs);
    await applyPriceRule(loaded, logs);
  }

  for (const { store } of loaded) {
    try {
      await syncOrders(store, logs);
      await syncCarts(store, logs);
      await db.store.update({ where: { id: store.id }, data: { lastSyncAt: new Date(), lastError: null } });
    } catch (e) {
      await fail(store, e, logs);
    }
  }

  if (logs.length) await db.syncLog.createMany({ data: logs.map((l) => ({ ...l, userId })) });
  await db.user.update({ where: { id: userId }, data: { lastSyncAt: new Date() } });
}

async function fail(store: Store, e: unknown, logs: Log[]) {
  const message = e instanceof Error ? e.message : String(e);
  logs.push({ level: "error", storeLabel: store.label, message });
  await db.store.update({ where: { id: store.id }, data: { lastError: message.slice(0, 500) } });
}

/** Uzak varyantları DB'ye yansıtır; SKU -> satır haritası döner (tekrarlı SKU'lar hariç). */
async function saveVariants(store: Store, remote: RemoteVariant[], logs: Log[]) {
  // Elle eşleştirmeler: bu mağazadaki SKU -> ortak stokta kullanılacak anahtar.
  const alias = new Map((await db.skuAlias.findMany({ where: { storeId: store.id } })).map((a) => [a.sku, a.matchSku]));
  const keyOf = (sku: string) => alias.get(sku) ?? sku;
  const skuCount = new Map<string, number>();
  for (const v of remote) skuCount.set(keyOf(v.sku), (skuCount.get(keyOf(v.sku)) ?? 0) + 1);

  const existing = new Map((await db.storeVariant.findMany({ where: { storeId: store.id } })).map((r) => [r.variantId, r]));
  const seen = new Set<string>();
  const ops = [];
  for (const v of remote) {
    seen.add(v.variantId);
    const matchSku = keyOf(v.sku);
    const duplicateSku = (skuCount.get(matchSku) ?? 0) > 1;
    const row = existing.get(v.variantId);
    const data = {
      sku: v.sku, productId: v.productId, productName: v.productName, currentStock: v.stock, duplicateSku,
      sellPrice: v.sellPrice, discountPrice: v.discountPrice, buyPrice: v.buyPrice, imageId: v.imageId,
      barcode: v.barcode, matchSku,
    };
    if (!row) {
      ops.push(db.storeVariant.create({ data: { ...data, storeId: store.id, variantId: v.variantId } }));
    } else if (
      row.sku !== v.sku || row.currentStock !== v.stock || row.productName !== v.productName ||
      row.duplicateSku !== duplicateSku || row.productId !== v.productId ||
      row.sellPrice !== v.sellPrice || row.discountPrice !== v.discountPrice || row.buyPrice !== v.buyPrice || row.imageId !== v.imageId ||
      row.barcode !== v.barcode || row.matchSku !== matchSku
    ) {
      // SKU değiştiyse eski ortak stok bağı geçersizdir.
      ops.push(db.storeVariant.update({
        where: { id: row.id },
        data: { ...data, ...(row.sku !== v.sku || (row.matchSku && row.matchSku !== matchSku) ? { lastSeenStock: null } : {}) },
      }));
    }
  }
  const gone = [...existing.values()].filter((r) => !seen.has(r.variantId)).map((r) => r.id);
  if (gone.length) ops.push(db.storeVariant.deleteMany({ where: { id: { in: gone } } }));
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));

  for (const [sku, n] of skuCount) {
    if (n > 1) logs.push({ level: "warn", sku, storeLabel: store.label, message: `Aynı SKU ${n} varyantta kullanılıyor; bu SKU senkron dışı bırakıldı.` });
  }

  const rows = new Map<string, StoreVariant>();
  for (const r of await db.storeVariant.findMany({ where: { storeId: store.id, duplicateSku: false } })) rows.set(r.matchSku, r);
  return rows;
}

async function reconcileStocks(
  userId: string,
  loaded: { store: Store; locationId: string; rows: Map<string, StoreVariant> }[],
  logs: Log[],
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const settings = new Map((await db.skuSetting.findMany({ where: { userId } })).map((x) => [x.sku, x]));
  const shared = new Map((await db.sharedItem.findMany({ where: { userId } })).map((x) => [x.sku, x]));
  const common = [...loaded[0].rows.keys()].filter((sku) => loaded.every((l) => l.rows.has(sku)));

  type Change = { sku: string; name: string; old: number | null; next: number; rows: StoreVariant[]; targets: number[]; pending: number; note: string | null };
  const changes: Change[] = [];
  const writes = loaded.map(() => [] as { productId: string; variantId: string; stockCount: number }[]);
  const unlink: string[] = [];

  for (const sku of common) {
    const rows = loaded.map((l) => l.rows.get(sku)!);
    const item = shared.get(sku);
    const set = settings.get(sku);
    if (set?.excluded) {
      // Senkron dışı: bağ varsa kaldırılır, mağaza stoklarına dokunulmaz.
      if (item || rows.some((r) => r.lastSeenStock !== null)) unlink.push(sku);
      continue;
    }
    const old = item ? item.sharedStock : null;
    const pending = item?.pendingDelta ?? 0;
    const next = reconcile(old, rows.map((r) => ({ current: r.currentStock, lastSeen: r.lastSeenStock })), pending);
    const safety = set?.safetyStock ?? user.safetyStock;
    const targets = loaded.map((l) => publish(next, safety, l.store.stockSharePercent));
    const inSync = rows.every((r, i) => r.currentStock === targets[i] && r.lastSeenStock === targets[i]);
    if (item && old === next && inSync && !pending) continue;
    changes.push({ sku, name: rows[0].productName, old, next, rows, targets, pending, note: item?.pendingNote ?? null });
    rows.forEach((r, i) => {
      if (r.currentStock !== targets[i]) writes[i].push({ productId: r.productId, variantId: r.variantId, stockCount: targets[i] });
    });
  }

  if (unlink.length) {
    await db.$transaction([
      db.sharedItem.deleteMany({ where: { userId, sku: { in: unlink } } }),
      db.storeVariant.updateMany({ where: { storeId: { in: loaded.map((l) => l.store.id) }, sku: { in: unlink } }, data: { lastSeenStock: null } }),
    ]);
  }
  if (!changes.length) return;

  // Mağazalara yaz. Bir mağazaya yazılamazsa o mağaza bir sonraki turda tekrar denenir.
  const written = await Promise.all(
    loaded.map(async (l, i) => {
      if (!writes[i].length) return true;
      try {
        await setStocks(l.store, l.locationId, writes[i]);
        return true;
      } catch (e) {
        await fail(l.store, e, logs);
        return false;
      }
    }),
  );

  const ops = [];
  const movements: { userId: string; sku: string; storeLabel: string | null; delta: number; sharedAfter: number; reason: string; note: string | null }[] = [];
  for (const c of changes) {
    ops.push(db.sharedItem.upsert({
      where: { userId_sku: { userId, sku: c.sku } },
      create: { userId, sku: c.sku, name: c.name, sharedStock: c.next },
      update: { name: c.name, sharedStock: c.next, pendingDelta: 0, pendingNote: null },
    }));
    c.rows.forEach((r, i) => {
      // Yazma başarılıysa mağaza hedef değerde; değilse farkı tükettik sayıp mevcut değerini
      // hatırlıyoruz (sonraki turda current != hedef olduğu için yeniden yazılır).
      const value = written[i] ? c.targets[i] : r.currentStock;
      ops.push(db.storeVariant.update({ where: { id: r.id }, data: { currentStock: value, lastSeenStock: value } }));
      const delta = r.lastSeenStock === null || c.old === null ? 0 : r.currentStock - r.lastSeenStock;
      if (delta) movements.push({ userId, sku: c.sku, storeLabel: loaded[i].store.label, delta, sharedAfter: c.next, reason: delta < 0 ? "sale" : "increase", note: null });
    });
    if (c.pending) movements.push({ userId, sku: c.sku, storeLabel: null, delta: c.pending, sharedAfter: c.next, reason: "panel", note: c.note });
    const detail = c.rows.map((r, i) => `${loaded[i].store.label}: ${r.currentStock}`).join(", ");
    if (c.old === null) {
      movements.push({ userId, sku: c.sku, storeLabel: null, delta: c.next, sharedAfter: c.next, reason: "link", note: detail });
      logs.push({ level: "info", sku: c.sku, message: `Ortak stoğa bağlandı → ${c.next} (${detail})` });
    } else if (c.old !== c.next) {
      logs.push({ level: "info", sku: c.sku, message: `Ortak stok ${c.old} → ${c.next} (${detail})` });
    }
    const threshold = settings.get(c.sku)?.lowStockThreshold ?? user.lowStockThreshold;
    if (threshold !== null && c.next <= threshold && (c.old === null || c.old > threshold)) {
      logs.push({ level: "warn", sku: c.sku, message: `Düşük stok: ${c.name} — ${c.next} adet kaldı (eşik ${threshold}).` });
    }
  }
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  if (movements.length) await db.stockMovement.createMany({ data: movements });
}

/**
 * Otomatik fiyat kuralı: kuralı açık olan mağazanın fiyatları, diğer (kaynak) mağazanın
 * fiyatlarından hesaplanıp yazılır. Kaynak mağazanın fiyatlarına dokunulmaz.
 */
async function applyPriceRule(
  loaded: { store: Store; locationId: string; rows: Map<string, StoreVariant> }[],
  logs: Log[],
) {
  const target = loaded.find((l) => l.store.priceRuleActive);
  const source = loaded.find((l) => l !== target);
  if (!target || !source || source.store.priceRuleActive) return;
  const rule = { percent: target.store.pricePercent, fixed: target.store.priceFixed, round: target.store.priceRound };

  const writes: (PriceWrite & { rowId: string; sku: string; old: number | null })[] = [];
  for (const [sku, src] of source.rows) {
    const row = target.rows.get(sku);
    if (!row || src.sellPrice === null) continue;
    const sellPrice = applyRule(src.sellPrice, rule);
    let discountPrice = src.discountPrice === null ? null : applyRule(src.discountPrice, rule);
    if (discountPrice !== null && discountPrice >= sellPrice) discountPrice = null;
    const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 0.005);
    if (same(row.sellPrice, sellPrice) && same(row.discountPrice, discountPrice)) continue;
    writes.push({ rowId: row.id, sku, old: row.sellPrice, productId: row.productId, variantId: row.variantId, sellPrice, discountPrice, buyPrice: row.buyPrice });
  }
  if (!writes.length) return;
  try {
    await setPrices(target.store, writes);
  } catch (e) {
    await fail(target.store, e, logs);
    return;
  }
  const ops = writes.map((w) => db.storeVariant.update({ where: { id: w.rowId }, data: { sellPrice: w.sellPrice, discountPrice: w.discountPrice } }));
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  for (const w of writes.slice(0, 30)) {
    logs.push({ level: "info", sku: w.sku, storeLabel: target.store.label, message: `Fiyat kuralı: ${w.old ?? "—"} → ${w.sellPrice}${w.discountPrice !== null ? ` (indirimli ${w.discountPrice})` : ""}` });
  }
  if (writes.length > 30) logs.push({ level: "info", storeLabel: target.store.label, message: `Fiyat kuralı ${writes.length - 30} SKU'da daha uygulandı.` });
}

const hostOf = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
};

async function syncOrders(store: Store, logs: Log[]) {
  const startedAt = new Date();
  const since = store.lastOrderSyncAt
    ? new Date(store.lastOrderSyncAt.getTime() - 5 * 60_000)
    : new Date(Date.now() - 30 * 24 * 3600_000); // ilk senkron: son 30 gün
  const { orders, rich } = await listOrders(store, since);
  if (!rich && orders.length) logs.push({ level: "warn", storeLabel: store.label, message: "Sipariş kaynak/kampanya alanları ikas'tan okunamadı; raporlar bu siparişler için eksik kalır." });
  for (const o of orders) {
    const data = {
      orderNumber: o.orderNumber ?? "-",
      status: o.status,
      paymentStatus: o.orderPaymentStatus,
      packageStatus: o.orderPackageStatus,
      currency: o.currencyCode,
      totalFinalPrice: o.totalFinalPrice,
      orderedAt: o.orderedAt ? new Date(o.orderedAt) : null,
      shippingMethod: o.shippingMethod,
      packages: JSON.stringify(
        (o.orderPackages ?? []).map((p) => ({
          id: p.id ?? null,
          number: p.orderPackageNumber,
          status: p.orderPackageFulfillStatus ?? null,
          lineIds: p.orderLineItemIds ?? [],
          barcode: p.trackingInfo?.barcode ?? null,
          cargoCompany: p.trackingInfo?.cargoCompany ?? null,
          trackingNumber: p.trackingInfo?.trackingNumber ?? null,
          trackingLink: p.trackingInfo?.trackingLink ?? null,
        })),
      ),
      ...(rich
        ? {
            salesChannel: o.salesChannel?.name ?? o.salesChannel?.type ?? null,
            trafficSource: o.sessionInfo?.trafficSource?.source ?? o.sessionInfo?.trafficSource?.type ?? null,
            referer: hostOf(o.sessionInfo?.referer),
            utmSource: o.sessionInfo?.utm?.source ?? null,
            utmMedium: o.sessionInfo?.utm?.medium ?? null,
            utmCampaign: o.sessionInfo?.utm?.campaign ?? null,
            city: o.shippingAddress?.city?.name ?? null,
            district: o.shippingAddress?.district?.name ?? null,
            couponCode: o.couponCode ?? null,
            campaigns: JSON.stringify(
              (o.orderAdjustments ?? []).filter((a) => a.type === "DECREMENT").map((a) => ({ name: a.name, type: a.campaignType, amount: a.amount })),
            ),
          }
        : {}),
    };
    const lines = o.orderLineItems.map((l) => ({
      sku: l.variant?.sku ?? "",
      name: l.variant?.name ?? "",
      quantity: l.quantity,
      finalPrice: l.finalPrice,
      imageId: l.variant?.mainImageId ?? null,
      ikasLineId: l.id ?? null,
      status: l.status ?? null,
    }));
    await db.order.upsert({
      where: { storeId_ikasOrderId: { storeId: store.id, ikasOrderId: o.id } },
      create: { ...data, storeId: store.id, ikasOrderId: o.id, lines: { create: lines } },
      update: { ...data, lines: { deleteMany: {}, create: lines } },
    });
  }
  await db.store.update({ where: { id: store.id }, data: { lastOrderSyncAt: startedAt } });
}

/** Terk edilmiş sepetleri çeker. Hata olursa senkronun geri kalanını durdurmaz. */
async function syncCarts(store: Store, logs: Log[]) {
  const startedAt = new Date();
  const since = store.lastCartSyncAt ? new Date(store.lastCartSyncAt.getTime() - 5 * 60_000) : new Date(Date.now() - 30 * 24 * 3600_000);
  let carts;
  try {
    carts = await listAbandonedCheckouts(store, since);
  } catch (e) {
    logs.push({ level: "warn", storeLabel: store.label, message: `Terk edilmiş sepetler alınamadı: ${e instanceof Error ? e.message : e}` });
    return;
  }
  for (const c of carts) {
    const data = {
      status: c.status,
      recoveryStatus: c.recoveryStatus,
      emailStatus: c.recoverEmailStatus,
      total: c.totalFinalPrice,
      currency: c.cart?.currencyCode ?? "TRY",
      itemCount: c.cart?.itemCount ?? c.cart?.items.reduce((a, i) => a + i.quantity, 0) ?? 0,
      couponCode: c.couponCode,
      city: c.shippingAddress?.city?.name ?? null,
      lastActivityAt: c.cart?.lastActivityDate ? new Date(c.cart.lastActivityDate) : null,
      linesJson: JSON.stringify(
        (c.cart?.items ?? []).map((i) => ({ name: i.variant?.name ?? "", sku: i.variant?.sku ?? "", imageId: i.variant?.mainImageId ?? null, quantity: i.quantity, price: i.finalPrice })),
      ),
      seenAt: startedAt,
    };
    await db.abandonedCart.upsert({
      where: { storeId_ikasId: { storeId: store.id, ikasId: c.id } },
      create: { ...data, storeId: store.id, ikasId: c.id },
      update: data,
    });
  }
  await db.store.update({ where: { id: store.id }, data: { lastCartSyncAt: startedAt } });
}
