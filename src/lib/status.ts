// Sipariş, ödeme ve paket durumlarının Türkçe adları ve renk tonu. Panel ve mobil API aynı listeyi kullanır.
export type Tone = "green" | "amber" | "red" | "gray" | "sky";
type Map = Record<string, [string, Tone]>;

export const ORDER_STATUS: Map = {
  CREATED: ["Oluşturuldu", "gray"], DRAFT: ["Taslak", "gray"], CANCELLED: ["İptal edildi", "red"], PARTIALLY_CANCELLED: ["Kısmi iptal", "red"],
  REFUNDED: ["İade edildi", "red"], PARTIALLY_REFUNDED: ["Kısmi iade", "amber"], REFUND_REQUESTED: ["İade talebi", "amber"],
  REFUND_REJECTED: ["İade reddedildi", "gray"], WAITING_UPSELL_ACTION: ["Bekliyor", "amber"],
};
export const PAYMENT_STATUS: Map = {
  PAID: ["Ödendi", "green"], WAITING: ["Ödeme bekliyor", "amber"], PARTIALLY_PAID: ["Kısmi ödendi", "amber"], FAILED: ["Ödeme başarısız", "red"],
};
export const PACKAGE_STATUS: Map = {
  UNFULFILLED: ["Hazırlanıyor", "amber"], READY_FOR_SHIPMENT: ["Kargoya hazır", "sky"], PARTIALLY_READY_FOR_SHIPMENT: ["Kısmen hazır", "sky"],
  READY_FOR_PICK_UP: ["Teslim alınmaya hazır", "sky"], FULFILLED: ["Kargolandı", "sky"], PARTIALLY_FULFILLED: ["Kısmen kargolandı", "sky"],
  DELIVERED: ["Teslim edildi", "green"], PARTIALLY_DELIVERED: ["Kısmen teslim", "green"], UNABLE_TO_DELIVER: ["Teslim edilemedi", "red"],
  CANCELLED: ["İptal", "red"], PARTIALLY_CANCELLED: ["Kısmi iptal", "red"], CANCEL_REQUESTED: ["İptal talebi", "amber"], CANCEL_REJECTED: ["İptal reddedildi", "gray"],
  REFUNDED: ["İade", "red"], PARTIALLY_REFUNDED: ["Kısmi iade", "amber"], REFUND_REQUESTED: ["İade talebi", "amber"],
  REFUND_REQUEST_ACCEPTED: ["İade kabul edildi", "amber"], REFUND_REJECTED: ["İade reddedildi", "gray"],
};
/** Sipariş listesindeki durum sekmeleri: [anahtar, ad, paket durumları]. */
export const ORDER_FILTERS: [string, string, string[]][] = [
  ["hazirlaniyor", "Hazırlanıyor", ["UNFULFILLED", "READY_FOR_SHIPMENT", "PARTIALLY_READY_FOR_SHIPMENT", "READY_FOR_PICK_UP"]],
  ["kargoda", "Kargoda", ["FULFILLED", "PARTIALLY_FULFILLED"]],
  ["teslim", "Teslim edildi", ["DELIVERED", "PARTIALLY_DELIVERED"]],
  ["iptal-iade", "İptal / iade", Object.keys(PACKAGE_STATUS).filter((k) => /CANCEL|REFUND|UNABLE/.test(k))],
];
/** Bilinmeyen durum değeri olduğu gibi, gri tonla gösterilir. */
export const statusOf = (map: Map, value: string | null) => (value ? { code: value, label: map[value]?.[0] ?? value, tone: map[value]?.[1] ?? ("gray" as Tone) } : null);
