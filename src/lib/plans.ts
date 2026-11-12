// Paketler. Fiyatlar örnek değerlerdir; buradan değiştirilir (site, kayıt ve backofis aynı listeyi kullanır).
export const TRIAL_DAYS = 14;

export type Plan = {
  id: "baslangic" | "profesyonel" | "kurumsal";
  name: string;
  tagline: string;
  monthly: number; // aylık ödemede aylık fiyat (₺)
  yearlyMonthly: number; // yıllık ödemede aylık karşılığı (₺)
  skuLimit: number | null;
  features: string[];
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "baslangic", name: "Başlangıç", tagline: "Yeni başlayan mağazalar için", monthly: 499, yearlyMonthly: 399, skuLimit: 500,
    features: ["2 ikas mağazası", "500 SKU'ya kadar ortak stok", "Birleşik sipariş ekranı", "Düşük stok uyarıları", "E-posta desteği"],
  },
  {
    id: "profesyonel", name: "Profesyonel", tagline: "Büyüyen markalar için", monthly: 999, yearlyMonthly: 799, skuLimit: 5000, popular: true,
    features: ["Başlangıç paketindeki her şey", "5.000 SKU'ya kadar", "Otomatik fiyat kuralları", "Kampanya ve kupon yönetimi", "Tek formdan iki mağazaya ürün ekleme", "CSV ile toplu işlemler", "Öncelikli destek"],
  },
  {
    id: "kurumsal", name: "Kurumsal", tagline: "Yüksek hacimli operasyonlar için", monthly: 1999, yearlyMonthly: 1599, skuLimit: null,
    features: ["Profesyonel paketindeki her şey", "Sınırsız SKU", "Anlık (webhook) senkron önceliği", "Stok hareket geçmişi ve raporlar", "Kurulum ve geçiş desteği", "Özel hesap yöneticisi"],
  },
];

export const planById = (id: string | null | undefined) => PLANS.find((p) => p.id === id);
export const tl = (n: number) => new Intl.NumberFormat("tr-TR").format(n) + " ₺";

/** Aylık gelir karşılığı (yıllık ödeyenler için aylık karşılık). */
export const monthlyValue = (planId: string, period: string) => {
  const p = planById(planId);
  return p ? (period === "yillik" ? p.yearlyMonthly : p.monthly) : 0;
};

export type AccountStatus = "odeme" | "deneme" | "suresi-doldu" | "askida";
export function accountStatus(u: { suspended: boolean; paidUntil: Date | null; trialEndsAt: Date | null }, now: number): AccountStatus {
  if (u.suspended) return "askida";
  if (u.paidUntil && u.paidUntil.getTime() > now) return "odeme";
  if (u.trialEndsAt && u.trialEndsAt.getTime() > now) return "deneme";
  return "suresi-doldu";
}

// ───────────── Lisans fiyatı ─────────────
export const VAT_RATE = 0.2;

/** Bir paket ve dönem için tutar (KDV hariç), KDV ve toplam. */
export function priceOf(planId: string, period: string) {
  const p = planById(planId);
  if (!p) return null;
  const yearly = period === "yillik";
  const amount = yearly ? p.yearlyMonthly * 12 : p.monthly;
  const vat = Math.round(amount * VAT_RATE * 100) / 100;
  return { plan: p, period: yearly ? "yillik" : "aylik", amount, vat, total: amount + vat };
}

export const tl2 = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(n);
