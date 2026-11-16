import { getMerchantId, listAbandonedCheckouts, listOrderRefunds, listOrders, listStockLocations, listVariants, setPrices, setStocks } from "../ikas";
import type { PlatformAdapter } from "./types";

const hostOf = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
};

/** ikas adaptörü: mevcut istemciyi (src/lib/ikas.ts) ortak arayüze bağlar. */
export const ikasAdapter: PlatformAdapter = {
  id: "ikas",
  name: "ikas",
  host: (store) => `${store.storeName}.myikas.com`,
  listLocations: listStockLocations,
  getMerchantId,
  listVariants,
  setStocks,
  setPrices,
  listRefunds: async (store, orderId) => listOrderRefunds(store, orderId),

  async listOrders(store, since) {
    const { orders, rich, fin } = await listOrders(store, since);
    const sum = (xs: (number | null | undefined)[] | undefined) => (xs && xs.length ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : 0);
    return {
      rich, fin,
      orders: orders.map((o) => ({
        externalId: o.id,
        data: {
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
          ...(fin
            ? {
                totalPrice: o.totalPrice ?? null,
                shippingTotal: sum(o.shippingLines?.map((x) => x.finalPrice)),
                shippingTax: sum(o.shippingLines?.map((x) => x.taxValue)),
                taxTotal: sum(o.taxLines?.map((x) => x.price)),
                finSyncedAt: new Date(),
              }
            : {}),
        },
        lines: o.orderLineItems.map((l) => ({
          ...(fin ? { listPrice: l.price ?? null, taxAmount: l.taxValue ?? null } : {}),
          sku: l.variant?.sku ?? "",
          name: l.variant?.name ?? "",
          quantity: l.quantity,
          finalPrice: l.finalPrice,
          imageId: l.variant?.mainImageId ?? null,
          ikasLineId: l.id ?? null,
          status: l.status ?? null,
        })),
      })),
    };
  },

  async listCarts(store, since) {
    const carts = await listAbandonedCheckouts(store, since);
    return carts.map((c) => ({
      externalId: c.id,
      data: {
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
      },
    }));
  },
};
