// Finansal kayıt biçimi ve doğrulaması (saf; testlerde doğrudan kullanılır).
export const SOURCES = ["IKAS", "TRENDYOL", "HEPSIBURADA", "AMAZON", "N11", "MANUAL", "DEMO"] as const;
export const TXN_TYPES = {
  MARKETPLACE_COMMISSION: "Pazaryeri komisyonu", PAYMENT_FEE: "Ödeme kuruluşu komisyonu", SHIPPING_COST: "Kargo gideri", SHIPPING_INCOME: "Kargo geliri (müşteriden)",
  PACKAGING: "Paketleme / gönderim gideri", SERVICE_FEE: "İşlem / hizmet bedeli", RETURN_SHIPPING: "İade kargo gideri", OTHER: "Diğer sipariş gideri",
} as const;
export type TxnType = keyof typeof TXN_TYPES;

export type NormalizedTxn = {
  source: (typeof SOURCES)[number]; externalId: string; type: TxnType; direction: "DEBIT" | "CREDIT";
  amount: number; currency: string; taxAmount?: number | null; taxRate?: number | null; taxInclusive?: boolean | null;
  fxRate?: number | null; fxCurrency?: string | null; fxDate?: Date | null;
  occurredAt: Date; status?: "POSTED" | "PENDING" | "CANCELLED"; storeId?: string | null; orderId?: string | null; settlementId?: string | null; note?: string | null;
  allocationMethod?: "REVENUE" | "QUANTITY" | "WEIGHT" | "MANUAL" | null;
};
export type NormalizedReturn = {
  source: (typeof SOURCES)[number]; externalId: string; amount: number; currency: string; taxAmount?: number | null; includesShipping?: boolean | null;
  reason?: string | null; refundedAt: Date; status?: "POSTED" | "CANCELLED"; storeId?: string | null; orderId?: string | null;
};

/** Doğrulama (saf): hatalı kayıt içeri alınmaz; nedeni döner. */
export function validateTxn(t: NormalizedTxn): string | null {
  if (!SOURCES.includes(t.source)) return "Geçersiz kaynak";
  if (!t.externalId?.trim()) return "externalId gerekli (mükerrer kaydı önlemek için)";
  if (!(t.type in TXN_TYPES)) return "Geçersiz gider türü";
  if (t.direction !== "DEBIT" && t.direction !== "CREDIT") return "Geçersiz yön";
  if (!Number.isFinite(t.amount) || t.amount < 0) return "Tutar sıfır ya da pozitif olmalı (yön direction ile belirtilir)";
  if (!/^[A-Z]{3}$/.test(t.currency)) return "Para birimi üç harfli kod olmalı";
  if (t.taxAmount != null && (!Number.isFinite(t.taxAmount) || t.taxAmount < 0 || t.taxAmount > t.amount)) return "KDV tutarı geçersiz";
  if (t.fxRate != null && (!t.fxCurrency || !t.fxDate)) return "Kur kullanıldıysa kaynak para birimi ve kur tarihi gerekli";
  if (Number.isNaN(t.occurredAt.getTime())) return "Geçersiz tarih";
  if (t.allocationMethod != null && !["REVENUE", "QUANTITY", "WEIGHT", "MANUAL"].includes(t.allocationMethod)) return "Geçersiz dağıtım yöntemi";
  return null;
}


/** İşletme gideri kategorileri (siparişe bağlı olmayan giderler). */
export const EXPENSE_CATEGORIES = { PERSONNEL: "Personel", RENT: "Kira", SOFTWARE: "Yazılım abonelikleri", STORAGE: "Depolama", ADVERTISING: "Reklam (platform dışı)", OTHER: "Diğer operasyonel" } as const;
