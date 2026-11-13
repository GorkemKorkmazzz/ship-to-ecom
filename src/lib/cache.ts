import { revalidateTag, unstable_cache } from "next/cache";
import { cache } from "react";
import { db } from "./db";
import { listCampaigns, type RemoteCampaign } from "./ikas";

// Önbellek katmanı. Üç seviye var:
//  1. İstek içi tekilleştirme (React cache): aynı istekte layout + sayfa aynı sorguyu bir kez çalıştırır.
//  2. Veri önbelleği (unstable_cache): rapor/pano toplamları ve ikas kampanya listesi istekler arası saklanır.
//  3. Etiketle geçersiz kılma: senkron bittiğinde ya da panelden veri değiştiğinde ilgili etiket anında düşer.
// Stok, sipariş listesi ve ürün tabloları BİLEREK önbelleğe alınmaz; her zaman veritabanından okunur.

const userTag = (userId: string) => `user:${userId}`;
const campaignTag = (storeId: string) => `campaigns:${storeId}`;

/** Etiketi hemen düşürür. İstek kapsamı dışında çağrılırsa sessizce geçer; süre sınırı yine korur. */
function expire(tag: string) {
  try {
    revalidateTag(tag, { expire: 0 });
  } catch (e) {
    console.warn("önbellek geçersiz kılınamadı", tag, e instanceof Error ? e.message : e);
  }
}

/** Kullanıcının rapor/pano önbelleğini düşürür (senkron ve sipariş değişikliklerinden sonra). */
export const invalidateUser = (userId: string) => expire(userTag(userId));
/** Mağazanın kampanya listesi önbelleğini düşürür (kampanya ekleme/silmeden sonra). */
export const invalidateCampaigns = (storeId: string) => expire(campaignTag(storeId));

/** Kullanıcının mağazaları — aynı istekte layout ve sayfa için tek sorgu. */
export const getStores = cache((userId: string) => db.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }));

/** ikas kampanya listesi: uzak çağrı olduğu için 60 sn saklanır. Hata önbelleğe alınmaz. */
export function getCampaigns(storeId: string): Promise<RemoteCampaign[]> {
  return unstable_cache(
    async () => listCampaigns(await db.store.findUniqueOrThrow({ where: { id: storeId } })),
    ["campaigns", storeId],
    { tags: [campaignTag(storeId)], revalidate: 60 },
  )();
}

const lineSelect = { sku: true, name: true, quantity: true, finalPrice: true } as const;

/** Rapor sayfasının ham verisi (yalnızca kullanılan alanlar). En fazla 5 dk saklanır. */
export function getReportData(userId: string, storeIds: string[], range: number) {
  return unstable_cache(
    async () => {
      const since = new Date(Date.now() - range * 24 * 3600_000);
      const [orders, carts] = await Promise.all([
        db.order.findMany({
          where: { storeId: { in: storeIds }, store: { userId }, orderedAt: { gte: since }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } },
          select: {
            storeId: true, currency: true, totalFinalPrice: true, campaigns: true, paymentStatus: true, couponCode: true,
            salesChannel: true, trafficSource: true, referer: true, utmSource: true, utmMedium: true, utmCampaign: true,
            city: true, district: true, lines: { select: lineSelect },
          },
        }),
        db.abandonedCart.findMany({
          where: { storeId: { in: storeIds }, store: { userId }, lastActivityAt: { gte: since } },
          select: { status: true, recoveryStatus: true, total: true },
        }),
      ]);
      return { orders, carts };
    },
    ["report", userId, storeIds.join(","), String(range)],
    { tags: [userTag(userId)], revalidate: 300 },
  )();
}

/** Pano grafiği ve en çok satanlar için siparişler. Tarih ISO metin döner (önbellek JSON saklar). */
export function getDashboardOrders(userId: string, storeIds: string[], sinceIso: string) {
  return unstable_cache(
    async () => {
      const orders = await db.order.findMany({
        where: { storeId: { in: storeIds }, store: { userId }, orderedAt: { gte: new Date(sinceIso) }, deletedAt: null },
        select: { storeId: true, currency: true, totalFinalPrice: true, orderedAt: true, lines: { select: lineSelect } },
      });
      return orders.map((o) => ({ ...o, orderedAt: o.orderedAt ? o.orderedAt.toISOString() : null }));
    },
    ["dashboard", userId, storeIds.join(","), sinceIso],
    { tags: [userTag(userId)], revalidate: 300 },
  )();
}
