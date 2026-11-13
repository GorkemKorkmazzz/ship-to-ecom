import type { Store } from "@prisma/client";
import type { PriceWrite, RemoteVariant } from "../ikas";

export type { PriceWrite, RemoteVariant };
export type PlatformId = "ikas" | "tsoft";
export type StockWrite = { productId: string; variantId: string; stockCount: number };

/** Veritabanına yazılmaya hazır sipariş (platformdan bağımsız). Müşteri adı, e-posta, telefon, açık adres YOK. */
export type OrderRow = {
  externalId: string;
  data: {
    orderNumber: string;
    status: string;
    paymentStatus: string | null;
    packageStatus: string | null;
    currency: string;
    totalFinalPrice: number;
    orderedAt: Date | null;
    shippingMethod: string | null;
    packages: string; // JSON
    salesChannel?: string | null;
    trafficSource?: string | null;
    referer?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    city?: string | null;
    district?: string | null;
    couponCode?: string | null;
    campaigns?: string; // JSON
  };
  lines: { sku: string; name: string; quantity: number; finalPrice: number | null; imageId: string | null; ikasLineId: string | null; status: string | null }[];
};

export type CartRow = {
  externalId: string;
  data: {
    status: string;
    recoveryStatus: string | null;
    emailStatus: string | null;
    total: number;
    currency: string;
    itemCount: number;
    couponCode: string | null;
    city: string | null;
    lastActivityAt: Date | null;
    linesJson: string;
  };
};

/**
 * Bir e-ticaret platformunun senkron için sağlaması gerekenler.
 * Senkron (src/lib/sync.ts) yalnızca bu arayüzü kullanır; platforma özel her şey adaptörün içindedir.
 */
export interface PlatformAdapter {
  id: PlatformId;
  name: string;
  /** Panelde gösterilen mağaza adresi. */
  host(store: Store): string;
  /** Stok lokasyonları/depoları; ilki varsayılan kabul edilir. */
  listLocations(store: Store): Promise<{ id: string; name: string }[]>;
  /** Görsel adresi için gereken kimlik (yalnızca ikas). */
  getMerchantId?(store: Store): Promise<string>;
  /** SKU'su olan tüm varyantlar; stok, fiyat ve barkodla. */
  listVariants(store: Store, locationId: string): Promise<RemoteVariant[]>;
  /** Stokları MUTLAK değer olarak yazar. */
  setStocks(store: Store, locationId: string, items: StockWrite[]): Promise<void>;
  setPrices(store: Store, items: PriceWrite[]): Promise<void>;
  /** rich=false: rapor alanları (kanal, il, kampanya) okunamadı. */
  listOrders(store: Store, since: Date): Promise<{ orders: OrderRow[]; rich: boolean }>;
  /** Terk edilmiş sepetler (platform desteklemiyorsa tanımsız). */
  listCarts?(store: Store, since: Date): Promise<CartRow[]>;
}
