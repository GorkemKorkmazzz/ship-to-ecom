// Demo hesabı korumaları. Demo mağaza (clientId = "demo") ve demo reklam bağlantıları (externalUserId "demo-" ile başlar)
// hiçbir koşulda ikas, Meta ya da Google'a istek göndermez: veriler yalnızca yerel veritabanındadır (scripts/seed-demo.ts).
import type { RemoteCampaign } from "./ikas";

export const DEMO_CLIENT_ID = "demo";
export const isDemoStore = (s: { clientId: string } | null | undefined) => s?.clientId === DEMO_CLIENT_ID;
export const isDemoIntegration = (i: { externalUserId: string } | null | undefined) => !!i?.externalUserId.startsWith("demo-");
export const DEMO_NOTE = "Demo mağaza: ikas'a gönderilmedi, yalnızca panelde kaydedildi.";

/** Demo mağazanın "İndirimler" ekranında gösterilen kampanyalar (gerçekte ikas'ta durur; demoda sabit örnek). */
const d = (days: number) => Date.now() + days * 86_400_000;
export const DEMO_CAMPAIGNS: RemoteCampaign[] = [
  { id: "demo-c1", title: "Tüm ürünlerde %10", type: "RATIO", hasCoupon: false, usageCount: 214, usageLimit: null, dateRange: { start: d(-40), end: d(20) }, fixedDiscount: { amount: 10 } },
  { id: "demo-c2", title: "Giyim kategorisinde %20", type: "RATIO", hasCoupon: false, usageCount: 96, usageLimit: null, dateRange: { start: d(-14), end: d(16) }, fixedDiscount: { amount: 20 } },
  { id: "demo-c3", title: "1.000 TL üzeri 100 TL indirim", type: "FIXED_AMOUNT", hasCoupon: false, usageCount: 58, usageLimit: null, dateRange: { start: d(-60), end: d(30) }, fixedDiscount: { amount: 100 } },
  { id: "demo-c4", title: "İkinci ürüne %50 (Çok Al Az Öde)", type: "RATIO", hasCoupon: false, usageCount: 41, usageLimit: null, dateRange: { start: d(-30), end: d(30) }, fixedDiscount: { amount: 50 } },
  { id: "demo-c5", title: "Kozmetikte özel %15", type: "RATIO", hasCoupon: false, usageCount: 33, usageLimit: null, dateRange: { start: d(-10), end: d(5) }, fixedDiscount: { amount: 15 } },
  { id: "demo-c6", title: "HOSGELDIN kuponu %15", type: "RATIO", hasCoupon: true, usageCount: 77, usageLimit: 500, dateRange: { start: d(-90), end: d(60) }, fixedDiscount: { amount: 15 } },
  { id: "demo-c7", title: "Sepette 50 TL indirim", type: "FIXED_AMOUNT", hasCoupon: true, usageCount: 19, usageLimit: 200, dateRange: { start: d(-7), end: d(7) }, fixedDiscount: { amount: 50 } },
  { id: "demo-c8", title: "Hafta sonu ücretsiz kargo", type: "FREE_SHIPPING", hasCoupon: false, usageCount: 64, usageLimit: null, dateRange: { start: d(-2), end: d(1) }, fixedDiscount: null },
  { id: "demo-c9", title: "Kasım fırsatı %25 (sona erdi)", type: "RATIO", hasCoupon: false, usageCount: 120, usageLimit: null, dateRange: { start: d(-45), end: d(-15) }, fixedDiscount: { amount: 25 } },
];
export const DEMO_CATEGORIES = ["Giyim", "Elektronik", "Aksesuar", "Ev ve Yaşam", "Kozmetik"].map((name) => ({ id: `demo-kat-${name.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/g, "-")}`, name }));
