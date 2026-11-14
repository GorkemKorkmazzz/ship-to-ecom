// Paketler. Fiyatlar örnek değerlerdir; buradan değiştirilir (site, kayıt ve backofis aynı listeyi kullanır).
export const TRIAL_DAYS = 14;

export type Plan = {
  id: "baslangic" | "profesyonel" | "kurumsal";
  name: string;
  tagline: string;
  monthly: number; // aylık ödemede aylık fiyat (₺)
  yearlyMonthly: number; // yıllık ödemede aylık karşılığı (₺)
  skuLimit: number | null;
  storeLimit: number; // bağlanabilecek en fazla mağaza
  features: string[];
  popular?: boolean;
};

export type PlanId = Plan["id"];
const ORDER: PlanId[] = ["baslangic", "profesyonel", "kurumsal"];

/**
 * Ürün modülleri. Her modül, dahil olduğu en düşük pakete bağlanır; üst paketler alttakileri kapsar.
 * Site, lisans ekranı ve paket karşılaştırması bu listeden üretilir.
 * Not: Paket sınırları şu an yalnızca mağaza sayısında uygulanır; modül erişimi panelde henüz kısıtlanmıyor.
 */
export type Module = { id: string; group: string; name: string; text: string; icon: string; plan: PlanId };
export const MODULE_GROUPS = ["Stok ve sipariş", "Operasyon ve otomasyon", "Reklam ve analitik", "Mağaza vitrini"] as const;
export const MODULES: Module[] = [
  { id: "stok", group: "Stok ve sipariş", plan: "baslangic", name: "Ortak stok", text: "Aynı SKU'lu ürünler tüm mağazalarda tek stoktan düşer; bir mağazadaki satış diğerlerine otomatik yansır.", icon: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
  { id: "siparis", group: "Stok ve sipariş", plan: "baslangic", name: "Birleşik siparişler", text: "Tüm mağazaların siparişleri tek ekranda; durum, kargo barkodu ve takip bilgisiyle.", icon: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01" },
  { id: "sepet", group: "Stok ve sipariş", plan: "baslangic", name: "Terk edilmiş sepetler", text: "Tamamlanmayan sepetleri, tutarları ve kurtarılma durumlarıyla izleyin.", icon: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2" },
  { id: "uyari", group: "Stok ve sipariş", plan: "baslangic", name: "Stok uyarıları ve bildirimler", text: "Güvenlik stoğu ve düşük stok eşiğiyle fazla satışı önleyin; kritik durumlarda panel bildirimi alın.", icon: "M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" },
  { id: "rapor", group: "Stok ve sipariş", plan: "baslangic", name: "Satış özeti ve raporlar", text: "Ciro, sipariş, kanal, il ve kampanya kırılımlarıyla dönemsel satış raporları.", icon: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" },
  { id: "dagitim", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Akıllı stok dağıtımı", text: "Mağaza payı, mağaza başına minimum stok ve öncelikli mağaza; kritik stokta son adetler yalnızca öncelikli mağazada satılır.", icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4" },
  { id: "fiyat", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Otomatik fiyat kuralları", text: "Bir mağazanın fiyatını diğerinden yüzde ya da sabit farkla hesaplatın; kategori ve markaya göre toplu fiyat değiştirin.", icon: "M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H6" },
  { id: "otomasyon", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Sipariş otomasyonu", text: "Tutar, mağaza, ürün, stok ve duruma göre koşullar kurun; siparişleri etiketleyin, bildirim alın, stok kontrolü yapın.", icon: "M13 3L4 14h7l-1 7 9-11h-7l1-7z" },
  { id: "urun", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Ürün ekleme ve toplu işlemler", text: "Ürünü bir kez girin, tüm mağazalarda oluşsun; CSV ile toplu stok, fiyat ve ürün güncelleyin.", icon: "M12 5v14M5 12h14" },
  { id: "kampanya", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Kampanya ve kupon yönetimi", text: "Yüzde, tutar ve ücretsiz kargo kampanyalarını kupon kodlarıyla tüm mağazalarda aynı anda açın.", icon: "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z" },
  { id: "karlilik", group: "Operasyon ve otomasyon", plan: "profesyonel", name: "Kârlılık ve stok analizi", text: "Ürün bazlı kâr, en çok kazandıranlar, tahmini stok bitiş süresi ve yeniden sipariş önerisi.", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { id: "vitrin", group: "Mağaza vitrini", plan: "profesyonel", name: "Vitrin modülleri", text: "ikas mağazanızın temasında çalışan modülleri mağaza bazında açın, tasarlayın, yayınlamadan önizleyin ve performansını izleyin.", icon: "M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6" },
  { id: "siteler", group: "Reklam ve analitik", plan: "kurumsal", name: "Çoklu web sitesi", text: "Birden fazla web sitesini mağazalarıyla ve reklam hesaplarıyla birlikte yönetin, site bazında raporlayın.", icon: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" },
  { id: "meta", group: "Reklam ve analitik", plan: "kurumsal", name: "Meta Ads entegrasyonu", text: "Facebook ve Instagram reklam hesaplarını bağlayın; harcama, tıklama, satın alma ve ROAS verileri otomatik gelsin.", icon: "M3 11l14-6v14L3 13v-2zM7 13v5a2 2 0 004 0v-3" },
  { id: "google", group: "Reklam ve analitik", plan: "kurumsal", name: "Google Ads entegrasyonu", text: "Doğrudan ve yönetici (MCC) hesap altındaki Google Ads hesaplarının kampanya verileri.", icon: "M3 11l14-6v14L3 13v-2zM7 13v5a2 2 0 004 0v-3" },
  { id: "ga4", group: "Reklam ve analitik", plan: "kurumsal", name: "Google Analytics 4", text: "Site trafiği, kanal kırılımı ve GA4'ün ölçtüğü gelir, siteye göre.", icon: "M5 20V10M12 20V4M19 20v-7" },
  { id: "reklam", group: "Reklam ve analitik", plan: "kurumsal", name: "Reklam dashboard'u ve kampanya raporları", text: "Meta ve Google'ı yan yana karşılaştırın; günlük performans, kampanya tabloları ve dönem karşılaştırması.", icon: "M3 17l6-6 4 4 8-8M3 21h18" },
];
export const modulesOf = (plan: PlanId) => MODULES.filter((m) => ORDER.indexOf(m.plan) <= ORDER.indexOf(plan));
const own = (plan: PlanId) => MODULES.filter((m) => m.plan === plan).map((m) => m.name);

export const PLANS: Plan[] = [
  {
    id: "baslangic", name: "Başlangıç", tagline: "Yeni başlayan mağazalar için", monthly: 499, yearlyMonthly: 399, skuLimit: 500, storeLimit: 2,
    features: ["2 mağaza", "500 SKU'ya kadar", "ikas entegrasyonu", ...own("baslangic"), "E-posta desteği"],
  },
  {
    id: "profesyonel", name: "Profesyonel", tagline: "Büyüyen markalar için", monthly: 999, yearlyMonthly: 799, skuLimit: 5000, storeLimit: 3, popular: true,
    features: ["Başlangıç paketindeki her şey", "3 mağaza", "5.000 SKU'ya kadar", ...own("profesyonel"), "Öncelikli destek"],
  },
  {
    id: "kurumsal", name: "Kurumsal", tagline: "Çoklu site ve reklam yöneten markalar için", monthly: 1999, yearlyMonthly: 1599, skuLimit: null, storeLimit: 5,
    features: ["Profesyonel paketindeki her şey", "5 mağaza", "Sınırsız SKU", ...own("kurumsal"), "Kurulum ve geçiş desteği", "Özel hesap yöneticisi"],
  },
];

export const planById = (id: string | null | undefined) => PLANS.find((p) => p.id === id);
/** Paketin mağaza hakkı. Bilinmeyen pakette en düşük hak geçerlidir. */
export const storeLimitOf = (planId: string | null | undefined) => planById(planId)?.storeLimit ?? PLANS[0].storeLimit;
/** Daha fazla mağaza hakkı veren bir üst paket var mı? */
export const hasBiggerPlan = (planId: string | null | undefined) => PLANS.some((p) => p.storeLimit > storeLimitOf(planId));
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
