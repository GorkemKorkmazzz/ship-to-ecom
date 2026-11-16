// ShipToEcom demo hesabı: test@gmail.com hesabına bağlı "Demo E-Ticaret Mağazası"nı sentetik verilerle doldurur.
//
//   npx -y tsx@4.19.2 --env-file=.env scripts/seed-demo.mts
//
// Güvenlik:
// - Yalnızca DEMO_EMAIL hesabına dokunur; hesabın şifresi ve bilgileri değişmez.
// - Hesabın demo dışı (gerçek) bir mağazası varsa hiçbir şey yapmadan durur.
// - Demo mağaza clientId = "demo": ikas'a, demo reklam bağlantıları ("demo-...") Meta/Google'a istek göndermez (src/lib/demo.ts).
// - Tüm kişi/iletişim verileri uydurmadır (ornek.test alan adı, 555 0xx telefonlar); gerçek kişiye ait veri yoktur.
// - Tekrar çalıştırılabilir: önce bu hesabın demo verisi silinir, sonra aynı tohumla aynı veri üretilir.
import { Prisma, PrismaClient } from "@prisma/client";
import { createCipheriv, createHmac, randomBytes } from "node:crypto";
import path from "node:path";

const DEMO_EMAIL = "test@gmail.com";
const db = new PrismaClient();

// ── yardımcılar ──────────────────────────────────────────────────────────────
let seed = 20261115;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const weighted = <T,>(a: [T, number][]) => { let r = rnd() * a.reduce((s, x) => s + x[1], 0); for (const [v, w] of a) if ((r -= w) < 0) return v; return a[a.length - 1][0]; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const now = Date.now();
const ago = (days: number, hour = int(9, 22)) => { const d = new Date(now - days * DAY); d.setHours(hour, int(0, 59), int(0, 59), 0); return d.getTime() > now ? new Date(now - int(5, 120) * 60_000) : d; };
const dayStr = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const slug = (s: string) => s.toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const key = () => { const h = process.env.APP_SECRET ?? ""; if (!/^[0-9a-f]{64}$/i.test(h)) throw new Error("APP_SECRET gerekli (.env)"); return Buffer.from(h, "hex"); };
const encrypt = (plain: string) => { const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", key(), iv); const e = Buffer.concat([c.update(plain, "utf8"), c.final()]); return [iv, c.getAuthTag(), e].map((b) => b.toString("base64")).join("."); };
const hmac = (v: string) => createHmac("sha256", key()).update(v).digest("hex");
const COLORS: Record<string, string> = { Giyim: "#6366f1", Elektronik: "#0ea5e9", Aksesuar: "#f59e0b", "Ev ve Yaşam": "#10b981", Kozmetik: "#ec4899" };
const svg = (name: string, cat: string) => {
  const words = name.split(" "), l1 = words.slice(0, 2).join(" "), l2 = words.slice(2).join(" ");
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"><rect width="360" height="360" fill="${COLORS[cat]}"/><circle cx="300" cy="60" r="90" fill="#fff" opacity=".12"/><text x="24" y="300" font-family="Arial" font-size="26" font-weight="700" fill="#fff">${l1}</text><text x="24" y="332" font-family="Arial" font-size="22" fill="#fff" opacity=".9">${l2}</text><text x="24" y="44" font-family="Arial" font-size="16" fill="#fff" opacity=".85">${cat.toUpperCase()}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
};

// ── katalog (36 ürün, 5 kategori) ────────────────────────────────────────────
const CATALOG: [string, string, string, number][] = [
  // [kategori, ad, marka, satış fiyatı]
  ["Giyim", "Basic Pamuklu Tişört", "Moda Kolektif", 349.9], ["Giyim", "Oversize Kapüşonlu Sweatshirt", "Moda Kolektif", 899.9], ["Giyim", "Slim Fit Kot Pantolon", "DenimLab", 1199.9],
  ["Giyim", "Su Geçirmez Mont", "Outdoor Pro", 2499.9], ["Giyim", "Keten Gömlek", "Moda Kolektif", 749.9], ["Giyim", "Spor Tayt", "ActiveFit", 499.9], ["Giyim", "Triko Kazak", "DenimLab", 949.9],
  ["Elektronik", "Kablosuz Kulaklık", "SesTek", 1899.9], ["Elektronik", "Akıllı Saat", "Zamanix", 3499.9], ["Elektronik", "Bluetooth Hoparlör", "SesTek", 1299.9],
  ["Elektronik", "Hızlı Şarj Adaptörü 65W", "VoltPlus", 649.9], ["Elektronik", "Taşınabilir Powerbank 20000", "VoltPlus", 899.9], ["Elektronik", "Mekanik Klavye", "KeyCraft", 2299.9], ["Elektronik", "Kablosuz Mouse", "KeyCraft", 549.9],
  ["Aksesuar", "Deri Cüzdan", "Atölye 34", 599.9], ["Aksesuar", "Güneş Gözlüğü", "Lumen", 1099.9], ["Aksesuar", "Sırt Çantası", "Outdoor Pro", 1399.9], ["Aksesuar", "Çelik Kol Saati", "Zamanix", 1999.9],
  ["Aksesuar", "Örgü Bere", "Moda Kolektif", 249.9], ["Aksesuar", "Telefon Kılıfı", "VoltPlus", 199.9], ["Aksesuar", "Deri Kemer", "Atölye 34", 449.9],
  ["Ev ve Yaşam", "Seramik Kahve Kupası", "Evim Tasarım", 189.9], ["Ev ve Yaşam", "Pamuk Nevresim Takımı", "Evim Tasarım", 1299.9], ["Ev ve Yaşam", "Aromaterapi Mum", "Lavanta Evi", 279.9],
  ["Ev ve Yaşam", "Bambu Kesme Tahtası", "Evim Tasarım", 229.9], ["Ev ve Yaşam", "Dekoratif Yastık", "Evim Tasarım", 349.9], ["Ev ve Yaşam", "French Press 1L", "Kahve Atölyesi", 549.9], ["Ev ve Yaşam", "Masa Lambası", "Lumen", 899.9],
  ["Kozmetik", "Nemlendirici Yüz Kremi", "Doğa Bakım", 459.9], ["Kozmetik", "C Vitamini Serum", "Doğa Bakım", 649.9], ["Kozmetik", "Mat Ruj", "Renk Stüdyo", 299.9],
  ["Kozmetik", "Güneş Kremi SPF50", "Doğa Bakım", 399.9], ["Kozmetik", "Parfüm 50 ml", "Esans", 1499.9], ["Kozmetik", "Saç Bakım Yağı", "Lavanta Evi", 349.9], ["Kozmetik", "Göz Farı Paleti", "Renk Stüdyo", 549.9], ["Kozmetik", "Yüz Temizleme Jeli", "Doğa Bakım", 289.9],
];
const CAT_ID: Record<string, string> = Object.fromEntries(Object.keys(COLORS).map((c) => [c, `demo-kat-${c.toLocaleLowerCase("tr").replace(/[^a-z0-9ğüşıöç]+/g, "-")}`]));

const CITIES: [string, string[]][] = [["İstanbul", ["Kadıköy", "Beşiktaş", "Üsküdar", "Şişli", "Ataşehir", "Bakırköy"]], ["Ankara", ["Çankaya", "Keçiören", "Yenimahalle"]], ["İzmir", ["Karşıyaka", "Bornova", "Konak"]], ["Bursa", ["Nilüfer", "Osmangazi"]], ["Antalya", ["Muratpaşa", "Konyaaltı"]], ["Kocaeli", ["İzmit", "Gebze"]], ["Adana", ["Seyhan", "Çukurova"]], ["Eskişehir", ["Tepebaşı", "Odunpazarı"]]];
const AD_CAMPAIGNS: { p: "meta" | "google"; name: string; objective: string; ctr: number; cpc: number; cvr: number; aov: number; budget: number; start: number; status: string }[] = [
  { p: "meta", name: "Instagram | Yeni Sezon Giyim", objective: "OUTCOME_SALES", ctr: 0.021, cpc: 3.1, cvr: 0.0136, aov: 1150, budget: 50, start: 150, status: "ACTIVE" },
  { p: "meta", name: "Facebook | Katalog Satış (DPA)", objective: "OUTCOME_SALES", ctr: 0.018, cpc: 2.6, cvr: 0.0116, aov: 980, budget: 40, start: 180, status: "ACTIVE" },
  { p: "meta", name: "Facebook | Elektronik Retargeting", objective: "OUTCOME_SALES", ctr: 0.025, cpc: 4.2, cvr: 0.0096, aov: 2100, budget: 28, start: 120, status: "ACTIVE" },
  { p: "meta", name: "Instagram | Hikaye - Flash İndirim", objective: "OUTCOME_SALES", ctr: 0.016, cpc: 3.4, cvr: 0.0068, aov: 760, budget: 22, start: 45, status: "ACTIVE" },
  { p: "meta", name: "Instagram | Kozmetik Reels", objective: "OUTCOME_ENGAGEMENT", ctr: 0.012, cpc: 2.2, cvr: 0.0044, aov: 610, budget: 20, start: 90, status: "ACTIVE" },
  { p: "meta", name: "Facebook | Geniş Kitle Tanıtım", objective: "OUTCOME_AWARENESS", ctr: 0.007, cpc: 5.8, cvr: 0.0016, aov: 700, budget: 25, start: 160, status: "PAUSED" },
  { p: "google", name: "Google | Marka Arama", objective: "SEARCH", ctr: 0.092, cpc: 1.9, cvr: 0.012, aov: 1240, budget: 17, start: 180, status: "ENABLED" },
  { p: "google", name: "Google | Shopping - Elektronik", objective: "SHOPPING", ctr: 0.014, cpc: 3.8, cvr: 0.0104, aov: 2050, budget: 45, start: 170, status: "ENABLED" },
  { p: "google", name: "Google | Performance Max", objective: "PERFORMANCE_MAX", ctr: 0.011, cpc: 3.3, cvr: 0.0084, aov: 1100, budget: 55, start: 100, status: "ENABLED" },
  { p: "google", name: "Google | Display Remarketing", objective: "DISPLAY", ctr: 0.006, cpc: 1.4, cvr: 0.0048, aov: 820, budget: 14, start: 140, status: "ENABLED" },
  { p: "google", name: "Google | Genel Arama - Ev Yaşam", objective: "SEARCH", ctr: 0.031, cpc: 6.4, cvr: 0.0036, aov: 640, budget: 22, start: 130, status: "ENABLED" },
  { p: "google", name: "Google | YouTube Tanıtım", objective: "VIDEO", ctr: 0.004, cpc: 2.9, cvr: 0.0008, aov: 900, budget: 20, start: 75, status: "PAUSED" },
];

async function main() {
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL }, include: { stores: true } });
  if (!user) throw new Error(`${DEMO_EMAIL} bulunamadı. Yeni kullanıcı oluşturulmaz.`);
  if (user.stores.some((s) => s.clientId !== "demo")) throw new Error("Bu hesapta gerçek (demo olmayan) mağaza var; güvenlik için durduruldu.");
  // Demo reklam verisi gerçek reklam verisiyle aynı raporlarda toplanmasın: hesapta gerçek reklam bağlantısı varsa durulur.
  if (await db.adIntegration.count({ where: { userId: user.id, NOT: { externalUserId: { startsWith: "demo-" } } } }))
    throw new Error("Bu hesapta gerçek reklam bağlantısı var; demo verisi gerçek verilerle karışmasın diye durduruldu.");
  const userId = user.id;
  console.log(`hesap: ${user.email} (${userId}), paket: ${user.plan}`);

  // ── temizlik (yalnızca bu hesabın demo verisi) ─────────────────────────────
  await db.store.deleteMany({ where: { userId, clientId: "demo" } }); // ürün, sipariş, sepet, modül, istatistik, çark, ürün bilgisi cascade
  for (const m of [db.sharedItem, db.skuSetting, db.definition, db.stockMovement, db.syncLog, db.notification, db.automationRule, db.website, db.adIntegration, db.returnFinancial, db.financialTransaction, db.marketplaceSettlement, db.productCostHistory, db.expense] as unknown as { deleteMany: (a: object) => Promise<unknown> }[])
    await m.deleteMany({ where: { userId } });

  // ── mağaza ────────────────────────────────────────────────────────────────
  const store = await db.store.create({
    data: {
      userId, label: "Demo E-Ticaret Mağazası", platform: "ikas", storeName: "shiptoecom-demo-magaza", clientId: "demo", clientSecretEnc: encrypt("demo"),
      webhookSecret: randomBytes(16).toString("hex"), stockLocationId: "demo-depo", merchantId: null, lastSyncAt: new Date(), lastOrderSyncAt: new Date(), lastCartSyncAt: new Date(),
      sfKey: randomBytes(16).toString("hex"), createdAt: new Date(now - 365 * DAY),
    },
  });

  // ── ürünler ───────────────────────────────────────────────────────────────
  type P = { sku: string; productId: string; variantId: string; name: string; cat: string; brand: string; sell: number; disc: number | null; buy: number; stock: number; image: string; created: Date };
  const products: P[] = CATALOG.map(([cat, name, brand, sell], i) => {
    const n = String(i + 1).padStart(3, "0");
    const disc = i % 3 === 0 ? r2(Math.round(sell * pick([0.8, 0.85, 0.75, 0.9])) - 0.1) : null; // her üç üründen biri indirimli
    const stock = [4, 11, 19, 27].includes(i) ? 0 : [2, 8, 15, 22, 29, 33].includes(i) ? int(1, 5) : int(18, 140); // 4 tükenmiş, 6 azalan
    return { sku: `DM-${cat.slice(0, 3).toLocaleUpperCase("tr")}-${n}`, productId: `demo-p${n}`, variantId: `demo-v${n}`, name, cat, brand, sell, disc, buy: r2(sell * (0.42 + rnd() * 0.15)), stock, image: svg(name, cat), created: new Date(now - (i < 6 ? int(2, 12) : int(40, 330)) * DAY) };
  });
  const barcode = (i: number) => { const b = `86900${String(100000 + i * 37).slice(0, 6)}${int(0, 9)}`; let s = 0; for (let k = 0; k < 12; k++) s += +b[k] * (k % 2 ? 3 : 1); return b + ((10 - (s % 10)) % 10); };
  await db.storeVariant.createMany({ data: products.map((p, i) => ({ storeId: store.id, sku: p.sku, productId: p.productId, variantId: p.variantId, productName: p.name, currentStock: p.stock, sellPrice: p.sell, discountPrice: p.disc, buyPrice: p.buy, imageId: p.image, barcode: barcode(i), matchSku: p.sku, lastSeenStock: p.stock })) });
  await db.sharedItem.createMany({ data: products.map((p) => ({ userId, sku: p.sku, name: p.name, sharedStock: p.stock })) });
  await db.skuSetting.createMany({ data: products.map((p) => ({ userId, sku: p.sku, category: p.cat, brand: p.brand, fields: JSON.stringify({ Açıklama: `${p.brand} ${p.name}. ${p.cat} kategorisinde demo ürün.`, Durum: p.stock > 0 ? "Satışta" : "Tükendi" }) })) });
  await db.definition.createMany({ data: [...Object.keys(COLORS).map((name) => ({ userId, kind: "category", name })), ...[...new Set(products.map((p) => p.brand))].map((name) => ({ userId, kind: "brand", name })), { userId, kind: "field", name: "Açıklama" }, { userId, kind: "field", name: "Durum" }] });
  await db.productMeta.createMany({ data: products.map((p) => ({ storeId: store.id, productId: p.productId, name: p.name, slug: slug(p.name), categoryIds: JSON.stringify([CAT_ID[p.cat]]), createdAt: p.created })) });
  console.log(`ürün: ${products.length} (indirimli ${products.filter((p) => p.disc).length}, azalan ${products.filter((p) => p.stock > 0 && p.stock <= 5).length}, tükenen ${products.filter((p) => !p.stock).length})`);

  // ── siparişler ─────────────────────────────────────────────────────────────
  // Gün dağılımı: son 12 ay; yakın dönem daha yoğun. Bugün ve dün mutlaka sipariş var.
  const dates: Date[] = [];
  for (let d = 0; d < 365; d++) { const n = d === 0 ? 4 : d === 1 ? 5 : d < 30 ? int(1, 3) : d < 90 ? weighted([[0, 2], [1, 4], [2, 2]]) : weighted([[0, 5], [1, 4], [2, 1]]); for (let k = 0; k < n; k++) dates.push(ago(d, d === 0 ? int(8, Math.max(8, new Date().getHours())) : undefined)); }
  dates.sort((a, b) => a.getTime() - b.getTime());
  const sources: [{ ch: string; src: string; utm?: [string, string, string]; ref?: string }, number][] = [
    [{ ch: "Web Sitesi", src: "Organik" }, 26], [{ ch: "Web Sitesi", src: "Direkt" }, 14], [{ ch: "Mobil Uygulama", src: "Direkt" }, 9],
    [{ ch: "Web Sitesi", src: "Reklam", utm: ["instagram", "paid_social", "Instagram | Yeni Sezon Giyim"] }, 11], [{ ch: "Web Sitesi", src: "Reklam", utm: ["facebook", "paid_social", "Facebook | Katalog Satış (DPA)"] }, 8],
    [{ ch: "Web Sitesi", src: "Reklam", utm: ["google", "cpc", "Google | Marka Arama"] }, 10], [{ ch: "Web Sitesi", src: "Reklam", utm: ["google", "cpc", "Google | Shopping - Elektronik"] }, 7],
    [{ ch: "Web Sitesi", src: "Sosyal", ref: "instagram.com" }, 6], [{ ch: "Web Sitesi", src: "E-posta", utm: ["newsletter", "email", "Haftalık Bülten"] }, 5], [{ ch: "Web Sitesi", src: "Yönlendirme", ref: "akakce.com" }, 4],
  ];
  const ORDERS: Parameters<typeof db.order.create>[0]["data"][] = [];
  const LINES: { orderNumber: string; sku: string; name: string; quantity: number; finalPrice: number; imageId: string; status: string }[] = [];
  let no = 10240;
  const stats = { revenue: 0, discount: 0, shipping: 0 };
  for (const at of dates) {
    const age = (now - at.getTime()) / DAY;
    const lineCount = weighted([[1, 5], [2, 3], [3, 1.5], [4, 0.5]]);
    const chosen = new Set<P>(); while (chosen.size < lineCount) chosen.add(pick(products.filter((p) => p.stock > 0 || age > 20)));
    const lines = [...chosen].map((p) => ({ p, qty: weighted([[1, 7], [2, 2.5], [3, 0.5]]), unit: p.disc ?? p.sell }));
    const subtotal = r2(lines.reduce((s, l) => s + l.unit * l.qty, 0));
    const qty = lines.reduce((s, l) => s + l.qty, 0);
    // İndirimler (siparişte ikas indirim satırı olarak görünür; vitrin modülleri ve kampanyalar kampanya adına göre ölçülür).
    const camps: { name: string; type: string; amount: number }[] = [];
    let coupon: string | null = null;
    const r = rnd();
    if (qty >= 3 && r < 0.45) camps.push({ name: "Çok Al Az Öde", type: "DECREMENT", amount: r2(subtotal * 0.15) });
    else if (qty >= 2 && r < 0.4) camps.push({ name: "Çok Al Az Öde", type: "DECREMENT", amount: r2(subtotal * 0.1) });
    else if (r < 0.1) { coupon = "HOSGELDIN"; camps.push({ name: "HOSGELDIN kuponu %15", type: "DECREMENT", amount: r2(subtotal * 0.15) }); }
    else if (r < 0.17 && age < 30) camps.push({ name: "Flash Hafta Sonu %20", type: "DECREMENT", amount: r2(subtotal * 0.2) });
    else if (r < 0.24 && age < 40) camps.push({ name: "Sepette %10 ek indirim", type: "DECREMENT", amount: r2(subtotal * 0.1) });
    else if (r < 0.28 && age < 120) { coupon = `CARK-${String(no).slice(-4)}DM`; camps.push({ name: "Hediye Çarkı: %10 İndirim", type: "DECREMENT", amount: r2(subtotal * 0.1) }); }
    if (subtotal >= 1000 && rnd() < 0.35) camps.push({ name: "1.000 TL üzeri 100 TL indirim", type: "DECREMENT", amount: 100 });
    const discount = r2(camps.reduce((s, c) => s + c.amount, 0));
    const shipping = subtotal - discount >= 750 ? 0 : 49.9;
    const total = r2(subtotal - discount + shipping);
    // Durum yaşa göre: yakın tarihli siparişler yeni/hazırlanıyor/kargoda, eskiler teslim edilmiş; bir kısmı iptal/iade.
    const st = age < 1 ? weighted([["new", 5], ["waiting", 2], ["preparing", 2]]) : age < 3 ? weighted([["preparing", 4], ["shipped", 4], ["waiting", 1], ["cancelled", 0.5]]) : age < 8 ? weighted([["shipped", 5], ["delivered", 4], ["cancelled", 0.6]]) : weighted([["delivered", 90], ["cancelled", 5], ["refunded", 5]]);
    const STATUS: Record<string, [string, string, string]> = { new: ["CREATED", "PAID", "UNFULFILLED"], waiting: ["CREATED", "WAITING", "UNFULFILLED"], preparing: ["CREATED", "PAID", "READY_FOR_SHIPMENT"], shipped: ["CREATED", "PAID", "FULFILLED"], delivered: ["CREATED", "PAID", "DELIVERED"], cancelled: ["CANCELLED", "REFUNDED", "CANCELLED"], refunded: ["REFUNDED", "REFUNDED", "REFUNDED"] };
    const [status, pay, pkg] = STATUS[st];
    const src = weighted(sources);
    const [city, dists] = pick(CITIES);
    const orderNumber = String(no++);
    const shippedAt = ["shipped", "delivered", "refunded"].includes(st);
    ORDERS.push({
      storeId: store.id, ikasOrderId: `demo-o${orderNumber}`, orderNumber, status, paymentStatus: pay, packageStatus: pkg, currency: "TRY", totalFinalPrice: total, orderedAt: at,
      shippingMethod: shipping ? "Standart Kargo (49,90 TL)" : "Ücretsiz Kargo",
      packages: JSON.stringify([{ id: `demo-pk${orderNumber}`, number: `${orderNumber}-1`, status: pkg, lineIds: [], barcode: shippedAt ? `DEMO${orderNumber}` : null, cargoCompany: shippedAt ? pick(["Yurtiçi Kargo", "Aras Kargo", "MNG Kargo"]) : null, trackingNumber: shippedAt ? `DM${orderNumber}TR` : null, trackingLink: null }]),
      salesChannel: src.ch, trafficSource: src.src, referer: src.ref ?? null, utmSource: src.utm?.[0] ?? null, utmMedium: src.utm?.[1] ?? null, utmCampaign: src.utm?.[2] ?? null,
      city, district: pick(dists), couponCode: coupon, campaigns: JSON.stringify(camps), createdAt: at,
    });
    for (const l of lines) LINES.push({ orderNumber, sku: l.p.sku, name: l.p.name, quantity: l.qty, finalPrice: l.unit, imageId: l.p.image, status: pkg });
    if (!["cancelled", "refunded"].includes(st)) { stats.revenue += total; stats.discount += discount; stats.shipping += shipping; }
  }
  await db.order.createMany({ data: ORDERS as never });
  const idOf = new Map((await db.order.findMany({ where: { storeId: store.id }, select: { id: true, orderNumber: true } })).map((o) => [o.orderNumber, o.id]));
  await db.orderLine.createMany({ data: LINES.map(({ orderNumber, ...l }) => ({ ...l, orderId: idOf.get(orderNumber)!, ikasLineId: null })) });
  console.log(`sipariş: ${ORDERS.length}, satır: ${LINES.length}, net ciro (iptal/iade hariç): ${r2(stats.revenue)} TL, indirim: ${r2(stats.discount)} TL`);

  // Stok hareketleri: son 30 günün satışları (ortak stok geçmişi ekranı için).
  const recent = LINES.filter((l) => { const o = ORDERS.find((x) => x.orderNumber === l.orderNumber)!; return now - (o.orderedAt as Date).getTime() < 30 * DAY; }).slice(-60);
  await db.stockMovement.createMany({ data: recent.map((l) => { const o = ORDERS.find((x) => x.orderNumber === l.orderNumber)!; const p = products.find((x) => x.sku === l.sku)!; return { userId, sku: l.sku, createdAt: o.orderedAt as Date, storeLabel: store.label, delta: -l.quantity, sharedAfter: p.stock, reason: "sale", note: `Sipariş #${l.orderNumber}` }; }) });

  // ── terk edilmiş sepetler ─────────────────────────────────────────────────
  const carts = Array.from({ length: 48 }, (_, i) => {
    const items = Array.from({ length: int(1, 3) }, () => pick(products.filter((p) => p.stock > 0))).map((p) => ({ name: p.name, sku: p.sku, imageId: p.image, quantity: int(1, 2), price: p.disc ?? p.sell }));
    const total = r2(items.reduce((s, x) => s + x.price * x.quantity, 0));
    const recovered = rnd() < 0.28;
    return { storeId: store.id, ikasId: `demo-cart-${i}`, status: recovered ? "COMPLETED" : weighted([["OPEN", 6], ["FREEZE", 2], ["KILLED", 1]]), recoveryStatus: recovered ? "RECOVERED" : "NOT_RECOVERED", emailStatus: rnd() < 0.6 ? "SENT" : "NOT_SENT", total, currency: "TRY", itemCount: items.reduce((s, x) => s + x.quantity, 0), couponCode: null, city: pick(CITIES)[0], lastActivityAt: ago(int(0, 85)), linesJson: JSON.stringify(items) };
  });
  await db.abandonedCart.createMany({ data: carts });

  // ── otomasyonlar (gerçek motor: src/lib/automation.ts runAutomations) ─────
  const ruleBase = new Date(now - 366 * DAY);
  const RULES: [string, object[], object[]][] = [
    ["VIP sipariş (2.000 TL ve üzeri)", [{ field: "tutar", op: "gte", value: "2000" }], [{ type: "etiket", value: "VIP" }, { type: "bildirim", value: "Yüksek tutarlı sipariş: özel paketleme ve teşekkür kartı ekleyin." }]],
    ["Yeni sipariş bilgilendirme", [{ field: "durum", op: "eq", value: "UNFULFILLED" }], [{ type: "bildirim", value: "Yeni sipariş hazırlanmayı bekliyor." }]],
    ["Ödeme bekleyen sipariş takibi", [{ field: "durum", op: "eq", value: "WAITING" }], [{ type: "etiket", value: "ödeme-takibi" }, { type: "bildirim", value: "Ödemesi bekleyen sipariş: havale/EFT kontrolü yapın." }]],
    ["Teslim sonrası memnuniyet takibi", [{ field: "durum", op: "eq", value: "DELIVERED" }], [{ type: "etiket", value: "memnuniyet-takibi" }]],
    ["Stoğu azalan ürün içeren sipariş", [{ field: "stok", op: "lte", value: "5" }], [{ type: "stok_kontrol", value: "5" }, { type: "etiket", value: "stok-kritik" }]],
    ["Elektronik ürün siparişi (sigortalı kargo)", [{ field: "urun", op: "eq", value: products.find((p) => p.cat === "Elektronik")!.sku }], [{ type: "etiket", value: "sigortali-kargo" }]],
    ["İptal edilen sipariş incelemesi", [{ field: "durum", op: "eq", value: "CANCELLED" }], [{ type: "etiket", value: "iptal-inceleme" }, { type: "bildirim", value: "İptal nedenini kontrol edin." }]],
    ["Düşük tutarlı sipariş (çapraz satış fırsatı)", [{ field: "tutar", op: "lte", value: "300" }], [{ type: "etiket", value: "capraz-satis" }]],
  ];
  for (const [name, c, a] of RULES) await db.automationRule.create({ data: { userId, name, conditions: JSON.stringify(c), actions: JSON.stringify(a), createdAt: ruleBase } });
  const automation = await import(path.resolve("src/lib/automation.ts"));
  const runAutomations = (automation.runAutomations ?? automation.default?.runAutomations) as (u: string, ids: string[]) => Promise<void>;
  await runAutomations(userId, [...idOf.values()]);
  const runs = await db.automationRun.count({ where: { rule: { userId } } });
  // Bildirim kutusu: en yeni 12 bildirim okunmamış, öncekiler okunmuş (sunumda "99+" görünmesin).
  const fresh = await db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12, select: { id: true } });
  await db.notification.updateMany({ where: { userId, id: { notIn: fresh.map((n) => n.id) } }, data: { readAt: new Date() } });
  console.log(`otomasyon: ${RULES.length} kural, ${runs} çalışma kaydı`);

  // ── vitrin modülleri ───────────────────────────────────────────────────────
  const ids = (f: (p: P) => boolean) => products.filter(f).map((p) => p.productId).join(",");
  const tr = (days: number) => dayStr(new Date(now + days * DAY)) + "T23:59";
  const MODULES: Record<string, object> = {
    "kampanya-bari": { name: "Kasım kampanyası", text: "Kasım fırsatları başladı! Tüm ürünlerde %10 indirim", link: "/", buttonText: "Fırsatları gör", marquee: false, bg: "#4f46e5", buttonColor: "#4f46e5", endAt: tr(20) },
    "bilgi-seridi": { placement: "below-price", layout: "stack", theme: "soft", brandColor: "#4f46e5", messages: [
      { text: "750 TL üzeri siparişlerde kargo ücretsiz", icon: "truck", target: "all" }, { text: "14 gün içinde ücretsiz iade", icon: "return", target: "all" },
      { text: "Kredi kartına 6 aya varan taksit", icon: "installment", target: "categories", categoryIds: CAT_ID.Elektronik }, { text: "Sepette ek %10 indirim", icon: "discount", code: "HOSGELDIN", target: "all" } ] },
    "cok-al-az-ode": { campaigns: [{ name: "Çok Al Az Öde", active: true, scope: "all", discountType: "RATIO", t1q: 2, t1a: 10, t2q: 3, t2a: 15, applicablePrice: "SELL_PRICE" }] },
    "tukenmek-uzere": { threshold: 5, scope: "all", showCount: true, indicator: "bar", barMax: 20 },
    "hediye-carki": { contactMode: "email", repeatDays: 30, codePrefix: "CARK", couponUsageLimit: 1, trigger: "delay", delaySeconds: 10, prizes: [
      { key: "p10", label: "%10 İndirim", type: "RATIO", amount: 10, chance: 30, color: "#f97316", icon: "discount" }, { key: "p50", label: "50 TL İndirim", type: "FIXED_AMOUNT", amount: 50, chance: 15, color: "#0ea5e9", icon: "gift" },
      { key: "kargo", label: "Ücretsiz Kargo", type: "FREE_SHIPPING", chance: 25, color: "#22c55e", icon: "truck" }, { key: "bos", label: "Tekrar dene", type: "NONE", chance: 30, color: "#94a3b8", icon: "none" } ] },
    "flash-urunler": { pageMode: "home", limit: 8, campaigns: [{ name: "Flash Hafta Sonu %20", active: true, title: "Flash İndirim", description: "Hafta sonuna özel, stoklarla sınırlı!", scope: "products", productIds: ids((p) => p.stock > 0 && ["Giyim", "Aksesuar"].includes(p.cat)), discountType: "RATIO", amount: 20, endAt: tr(2) }] },
    "fiyat-alti-indirim": { campaigns: [{ name: "Sepette %10 ek indirim", active: true, message: "Sepette {oran} ek indirim", scope: "categories", categoryIds: CAT_ID.Kozmetik, catProducts: ids((p) => p.cat === "Kozmetik"), discountType: "RATIO", amount: 10, endAt: tr(10) }] },
    "urun-etiketleri": { maxPerProduct: 2, labels: [
      { text: "Yeni", rule: "new", ruleValue: 14, bg: "#2563eb", icon: "bolt" }, { text: "Çok Satan", rule: "bestseller", ruleValue: 6, bestsellerDays: 30, bg: "#f59e0b", icon: "fire" },
      { text: "%{oran} İndirim", rule: "discount", ruleValue: 1, bg: "#dc2626", icon: "discount" }, { text: "Sınırlı Stok", rule: "lowStock", ruleValue: 5, bg: "#ea580c", icon: "clock" }, { text: "Tükendi", rule: "outOfStock", bg: "#4b5563" } ] },
    "duyuru-cubugu": { text: "Kargolarınız aynı gün çıkışlıdır (15:00'e kadar verilen siparişler)", link: "", position: "top", closable: true },
  };
  const { parseSettings, sfModule } = (await import(path.resolve("src/lib/storefront/modules.ts"))) as typeof import("../src/lib/storefront/modules");
  for (const [k, raw] of Object.entries(MODULES)) {
    const m = (sfModule ?? (await import(path.resolve("src/lib/storefront/modules.ts"))).default.sfModule)(k)!;
    const s = (parseSettings ?? (await import(path.resolve("src/lib/storefront/modules.ts"))).default.parseSettings)(m, JSON.stringify(raw));
    await db.storeModule.create({ data: { storeId: store.id, moduleKey: k, enabled: true, settings: JSON.stringify(s), version: int(1, 4), publishedAt: new Date(now - int(3, 40) * DAY) } });
  }
  // Modül olayları (vitrinden gelen görüntülenme/tıklanma): son 60 gün, modül başına farklı ilgi düzeyi.
  const INTEREST: Record<string, [number, number, number]> = { "kampanya-bari": [260, 0.045, 0.012], "bilgi-seridi": [180, 0.03, 0.02], "cok-al-az-ode": [150, 0, 0], "tukenmek-uzere": [70, 0.09, 0], "hediye-carki": [95, 0, 0], "flash-urunler": [210, 0.11, 0], "fiyat-alti-indirim": [90, 0.06, 0.08], "urun-etiketleri": [320, 0.07, 0], "duyuru-cubugu": [140, 0.01, 0.03] };
  const statRows: { storeId: string; moduleKey: string; day: string; type: string; count: number; value: number }[] = [];
  for (const [k, [base, ctr, use]] of Object.entries(INTEREST)) for (let d = 0; d < 60; d++) {
    const weekend = [0, 6].includes(new Date(now - d * DAY).getDay()) ? 1.25 : 1;
    const views = Math.round(base * weekend * (0.7 + rnd() * 0.6) * (d < 30 ? 1.1 : 0.9));
    const day = dayStr(new Date(now - d * DAY));
    statRows.push({ storeId: store.id, moduleKey: k, day, type: "view", count: views, value: 0 });
    if (ctr) statRows.push({ storeId: store.id, moduleKey: k, day, type: "click", count: Math.round(views * ctr * (0.7 + rnd() * 0.6)), value: 0 });
    if (use) statRows.push({ storeId: store.id, moduleKey: k, day, type: "use", count: Math.round(views * use * (0.6 + rnd() * 0.8)), value: 0 });
  }
  await db.moduleStat.createMany({ data: statRows });
  // Hediye Çarkı katılımları: olasılıklarla (30/15/25/30) seçilmiş ödüller; iletişim bilgisi saklanmaz, yalnızca özet.
  const PRIZES = [["p10", "%10 İndirim", "RATIO", 30], ["p50", "50 TL İndirim", "FIXED_AMOUNT", 15], ["kargo", "Ücretsiz Kargo", "FREE_SHIPPING", 25], ["bos", "Tekrar dene", "NONE", 30]] as const;
  const wheel = Array.from({ length: 164 }, (_, i) => { const p = weighted(PRIZES.map((x) => [x, x[3]] as [typeof x, number])); return { storeId: store.id, contactHash: hmac(`${store.id}:demo-katilimci-${i}@ornek.test`), ipHash: hmac(`ip-${i}`), cookieId: randomBytes(16).toString("hex"), consent: true, prizeKey: p[0], prizeLabel: p[1], prizeType: p[2], code: p[2] === "NONE" ? null : `CARK-DM${String(1000 + i)}`, campaignId: null, createdAt: ago(int(0, 58)) }; });
  await db.wheelEntry.createMany({ data: wheel });
  console.log(`vitrin: ${Object.keys(MODULES).length} modül aktif, ${statRows.length} günlük olay satırı, ${wheel.length} çark katılımı`);

  // ── maliyet geçmişi (DEMO) ─────────────────────────────────────────────
  // İki dönem: 400 gün önce − 60 gün önce eski maliyet (alış fiyatının %92'si), sonrası güncel alış fiyatı.
  // "Maliyeti bilinmeyen dönem" örneği: 3 ürünün geçmişi yalnızca son 20 günü kapsar; daha eski siparişlerinde maliyet eksik görünür.
  const unknownPast = new Set([products[2].sku, products[9].sku, products[17].sku]);
  const costRows: Prisma.ProductCostHistoryCreateManyInput[] = [];
  for (const p of products) {
    const cut = new Date(now - 60 * DAY);
    if (unknownPast.has(p.sku)) {
      costRows.push({ userId, storeId: store.id, sku: p.sku, productId: p.productId, unitCost: p.buy, purchaseCost: p.buy, currency: "TRY", validFrom: new Date(now - 20 * DAY), source: "DEMO" });
      continue;
    }
    const old = r2(p.buy * 0.92);
    costRows.push({ userId, storeId: store.id, sku: p.sku, productId: p.productId, unitCost: old, purchaseCost: old, currency: "TRY", validFrom: new Date(now - 400 * DAY), validTo: cut, source: "DEMO" });
    costRows.push({ userId, storeId: store.id, sku: p.sku, productId: p.productId, unitCost: p.buy, purchaseCost: r2(p.buy * 0.9), packagingCost: r2(p.buy * 0.06), labelCost: r2(p.buy - r2(p.buy * 0.9) - r2(p.buy * 0.06)), currency: "TRY", validFrom: cut, source: "DEMO" });
  }
  await db.productCostHistory.createMany({ data: costRows });
  // Sipariş kalemlerine sipariş anındaki maliyet snapshot'ı (gerçek senkronun yaptığı gibi).
  const demoLines = await db.orderLine.findMany({ where: { order: { storeId: store.id } }, select: { id: true, sku: true, order: { select: { orderedAt: true, currency: true } } } });
  let snapped = 0;
  for (const l of demoLines) {
    const at = l.order.orderedAt;
    const e = at && costRows.filter((c) => c.sku === l.sku && new Date(c.validFrom as Date) <= at && (!c.validTo || at < new Date(c.validTo as Date))).pop();
    if (!e || e.currency !== l.order.currency) continue;
    await db.orderLine.update({ where: { id: l.id }, data: { unitCost: e.unitCost, costCurrency: e.currency, costSource: "DEMO", costCapturedAt: at } });
    snapped++;
  }
  console.log(`maliyet geçmişi: ${costRows.length} kayıt, ${snapped}/${demoLines.length} kaleme snapshot`);

  // ── finansal kayıtlar (DEMO) ───────────────────────────────────────────
  // Sipariş finans alanları siparişin kendi tutarlarından türetilir (toplam = ara toplam − indirim + kargo). Demo varsayımı: fiyatlar %20 KDV dahil.
  // Giderler: ödeme kuruluşu komisyonu (%2,49), kargo gideri (kargolanan siparişler), iade kargo. Bir kısım siparişte gider kaydı bilerek yok (eksik veri örneği).
  const sellOf = new Map(products.map((p) => [p.sku, p.sell]));
  const finOrders = await db.order.findMany({ where: { storeId: store.id }, select: { id: true, ikasOrderId: true, status: true, packageStatus: true, totalFinalPrice: true, orderedAt: true, campaigns: true, lines: { select: { id: true, sku: true, quantity: true, finalPrice: true, status: true } } } });
  const txns: Prisma.FinancialTransactionCreateManyInput[] = [], rets: Prisma.ReturnFinancialCreateManyInput[] = [];
  for (const [i, o] of finOrders.entries()) {
    const subtotal = r2(o.lines.reduce((a, l) => a + (l.finalPrice ?? 0) * l.quantity, 0));
    const discount = r2((JSON.parse(o.campaigns) as { amount: number }[]).reduce((a, c) => a + c.amount, 0));
    const shipping = r2(o.totalFinalPrice - subtotal + discount);
    await db.order.update({ where: { id: o.id }, data: { totalPrice: subtotal, shippingTotal: shipping, shippingTax: r2(shipping / 6), taxTotal: r2((subtotal + shipping) / 6), finSyncedAt: o.orderedAt } });
    for (const l of o.lines) await db.orderLine.update({ where: { id: l.id }, data: { listPrice: sellOf.get(l.sku) ?? l.finalPrice, taxAmount: r2(((l.finalPrice ?? 0) * l.quantity) / 6) } });
    if (o.status === "CANCELLED" || !o.orderedAt) continue;
    const base = { userId, storeId: store.id, orderId: o.id, source: "DEMO", currency: "TRY", direction: "DEBIT" };
    if (i % 10 !== 3) txns.push({ ...base, externalId: `demo-fee-${o.ikasOrderId}`, type: "PAYMENT_FEE", amount: r2(o.totalFinalPrice * 0.0249), taxAmount: r2(o.totalFinalPrice * 0.0249 / 6), taxRate: 20, taxInclusive: true, occurredAt: o.orderedAt });
    if (/FULFILLED|DELIVERED|REFUND/.test(o.packageStatus ?? "") && i % 7 !== 2) txns.push({ ...base, externalId: `demo-kargo-${o.ikasOrderId}`, type: "SHIPPING_COST", amount: 62.5, taxAmount: 10.42, taxRate: 20, taxInclusive: true, occurredAt: o.orderedAt, allocationMethod: "QUANTITY" });
    const refundedLines = o.lines.filter((l) => l.status === "REFUNDED");
    if (refundedLines.length && /REFUND/.test(o.status)) {
      const amount = r2(refundedLines.reduce((a, l) => a + (l.finalPrice ?? 0) * l.quantity, 0));
      rets.push({ userId, storeId: store.id, orderId: o.id, source: "DEMO", externalId: `demo-iade-${o.ikasOrderId}`, amount, currency: "TRY", taxAmount: r2(amount / 6), includesShipping: false, reason: "Demo iade", refundedAt: new Date(o.orderedAt.getTime() + 6 * DAY) });
      txns.push({ ...base, externalId: `demo-iadekargo-${o.ikasOrderId}`, type: "RETURN_SHIPPING", amount: 62.5, taxAmount: 10.42, taxRate: 20, taxInclusive: true, occurredAt: new Date(o.orderedAt.getTime() + 5 * DAY) });
    }
  }
  await db.financialTransaction.createMany({ data: txns });
  await db.returnFinancial.createMany({ data: rets });
  // İşletme giderleri (DEMO): son 6 ay, aylık kira, yazılım ve personel.
  const opEx: Prisma.ExpenseCreateManyInput[] = [];
  for (let m = 0; m < 6; m++) {
    const d = new Date(now), first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m, 1, -3)), last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - m + 1, 1, -3) - 1000);
    for (const [category, amount, note] of [["RENT", 18000, "Depo kirası"], ["SOFTWARE", 2400, "E-ticaret ve muhasebe yazılımları"], ["PERSONNEL", 42000, "Paketleme ve müşteri hizmetleri"]] as const)
      opEx.push({ userId, category, amount, currency: "TRY", taxAmount: category === "PERSONNEL" ? null : r2(amount / 6), taxRate: category === "PERSONNEL" ? null : 20, taxInclusive: category === "PERSONNEL" ? null : true, periodStart: first, periodEnd: last, source: "DEMO", note });
  }
  await db.expense.createMany({ data: opEx });
  console.log(`finans: ${finOrders.length} siparişe finans alanı, ${txns.length} gider kaydı, ${rets.length} iade kaydı, ${opEx.length} işletme gideri`);

  // ── reklam ve analitik (yalnızca yerel demo verisi; platformlara istek yok) ─
  const site = await db.website.create({ data: { userId, name: "Demo E-Ticaret", domain: "demo-magaza.shiptoecom.test", storeId: store.id } });
  const integ = async (provider: string, name: string) => db.adIntegration.create({ data: { userId, provider, externalUserId: `demo-${provider}`, displayName: name, accessTokenEnc: encrypt("demo"), refreshTokenEnc: null, scopes: "demo", status: "active", lastSyncAt: new Date() } });
  const meta = await integ("meta", "Demo Meta Business"), google = await integ("google", "Demo Google Ads"), ga4 = await integ("ga4", "Demo Google Analytics");
  const acc = async (integrationId: string, provider: string, name: string, externalId: string) => db.adAccount.create({ data: { integrationId, provider, externalId, name, currency: "TRY", timezone: "Europe/Istanbul", selected: true, metricsSyncedAt: new Date(), metricsFrom: dayStr(new Date(now - 180 * DAY)), levelSyncedAt: new Date(), remoteStatus: provider === "meta" ? 1 : null } });
  const metaAcc = await acc(meta.id, "meta", "Demo Mağaza | Meta Reklam Hesabı", "act_demo_1001"), googleAcc = await acc(google.id, "google", "Demo Mağaza | Google Ads", "demo-123-456-7890");
  await db.websiteAdAccount.createMany({ data: [{ websiteId: site.id, adAccountId: metaAcc.id }, { websiteId: site.id, adAccountId: googleAcc.id }] });
  const metrics: Prisma.AdDailyMetricCreateManyInput[] = [];
  const campInfo: { camp: { id: string; name: string }; acc: { id: string }; c: (typeof AD_CAMPAIGNS)[number]; cbo: boolean }[] = [];
  for (const [i, c] of AD_CAMPAIGNS.entries()) {
    const a = c.p === "meta" ? metaAcc : googleAcc;
    // Bütçe: Meta'da bazı kampanyalar kampanya bütçeli (CBO), bazıları reklam seti bütçeli; Google'da kampanya bütçesi.
    const cbo = c.p === "google" || i % 2 === 0;
    const camp = await db.adCampaign.create({ data: { adAccountId: a.id, externalId: `demo-cmp-${i + 1}`, name: c.name, status: c.status, objective: c.objective, dailyBudget: cbo ? Math.round(c.budget * 1.15) : null, lifetimeBudget: null, budgetLevel: cbo ? "campaign" : "adset" } });
    campInfo.push({ camp, acc: a, c, cbo });
    const stopDay = c.status === "PAUSED" ? int(8, 25) : 0;
    for (let d = c.start; d >= stopDay; d--) {
      const date = new Date(now - d * DAY), wk = [0, 6].includes(date.getDay()) ? 1.2 : 1, trend = 0.85 + (1 - d / 180) * 0.3;
      const spend = r2(c.budget * wk * trend * (0.75 + rnd() * 0.5));
      const clicks = Math.max(1, Math.round((spend / c.cpc) * (0.85 + rnd() * 0.3)));
      const impressions = Math.round(clicks / (c.ctr * (0.85 + rnd() * 0.3)));
      const purchases = Math.floor(clicks * c.cvr * (0.6 + rnd() * 0.8) + rnd()); // olasılıklı yuvarlama: küçük günlük değerler sıfırlanmasın
      // Meta hunisi (DEMO): her aşama bir öncekinden küçük ya da eşit; satın alma ödeme başlatmadan büyük olamaz.
      const funnel: Partial<Prisma.AdDailyMetricCreateManyInput> = {};
      if (c.p === "meta") {
        const linkClicks = Math.round(clicks * (0.72 + rnd() * 0.12)), lpv = Math.round(linkClicks * (0.68 + rnd() * 0.14)), vc = Math.round(lpv * (0.8 + rnd() * 0.15));
        const ic = Math.max(purchases, Math.round(vc * (0.035 + rnd() * 0.03))), atc = Math.max(ic, Math.round(vc * (0.08 + rnd() * 0.05)));
        Object.assign(funnel, { linkClicks, landingPageViews: Math.max(lpv, vc), viewContent: vc, addToCart: atc, initiateCheckout: ic });
      }
      metrics.push({ adAccountId: a.id, campaignId: camp.id, date: dayStr(date), currency: "TRY", spend, impressions, reach: Math.round(impressions * (0.55 + rnd() * 0.15)), clicks, purchases, purchaseValue: r2(purchases * c.aov * (0.85 + rnd() * 0.3)), ...funnel });
    }
  }
  await db.adDailyMetric.createMany({ data: metrics });

  // Reklam seti / reklam grubu ve reklam kırılımı: kampanyanın günlük değerleri ağırlıklarla bölünür; toplamlar kampanyayla birebir aynıdır.
  const SETS: Record<string, string[]> = { meta: ["Geniş kitle 25-44", "Benzer kitle %1", "Site ziyaretçileri 30 gün"], google: ["Marka terimleri", "Ürün terimleri"] };
  const ADS: Record<string, string[]> = { meta: ["Video 15 sn", "Karusel", "Tek görsel"], google: ["Duyarlı arama reklamı A", "Duyarlı arama reklamı B"] };
  const split = (total: number, w: number[], int: boolean) => {
    const sum = w.reduce((a, b) => a + b, 0);
    const parts = w.map((x) => (int ? Math.floor((total * x) / sum) : r2((total * x) / sum)));
    const diff = int ? total - parts.reduce((a, b) => a + b, 0) : r2(total - parts.reduce((a, b) => a + b, 0));
    parts[0] = int ? parts[0] + diff : r2(parts[0] + diff); // yuvarlama farkı ilk parçaya
    return parts;
  };
  // Demo kreatif bilgisi: Meta türleri (video, carousel, görsel), "DEMO" yazılı sentetik küçük resimler; Google duyarlı arama reklamı asset'leri.
  const demoThumb = (title: string, kind: string, color: string) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${color}"/><rect x="16" y="16" width="86" height="30" rx="6" fill="#facc15"/><text x="30" y="37" font-family="Arial" font-size="16" font-weight="700" fill="#422006">DEMO</text>${kind === "VIDEO" ? '<circle cx="200" cy="140" r="38" fill="#fff" opacity=".9"/><path d="M188 120l32 20-32 20z" fill="' + color + '"/>' : kind === "CAROUSEL" ? '<rect x="70" y="80" width="110" height="110" rx="8" fill="#fff" opacity=".9"/><rect x="200" y="80" width="110" height="110" rx="8" fill="#fff" opacity=".6"/>' : '<rect x="120" y="70" width="160" height="130" rx="10" fill="#fff" opacity=".85"/>'}<text x="20" y="270" font-family="Arial" font-size="20" fill="#fff">${title.replace(/[<&]/g, "").slice(0, 32)}</text></svg>`);
  const META_KIND: Record<string, [string, string]> = { "Video 15 sn": ["VIDEO", "VIDEO"], Karusel: ["CAROUSEL", "SHARE"], "Tek görsel": ["IMAGE", "PHOTO"] };
  const demoCreative = (p: string, nm: string, campName: string, k: number) => {
    if (p === "meta") {
      const [type, obj] = META_KIND[nm] ?? ["IMAGE", "PHOTO"];
      return { creativeId: `demo-cr-${randomBytes(4).toString("hex")}`, creativeType: type, objectType: obj, thumbnailUrl: demoThumb(campName.replace(/^.*\| /, ""), type, ["#4f46e5", "#0ea5e9", "#db2777"][k % 3]), videoId: type === "VIDEO" ? `demo-video-${k}` : null, creativeSyncedAt: new Date() };
    }
    const heads = ["Resmi Mağaza", "Ücretsiz Kargo", "Kampanyalı Ürünler", "Yeni Sezon"], labels = ["BEST", "GOOD", "LOW", "LEARNING"];
    const assets = [...heads.map((h, j) => ({ fieldType: "HEADLINE", label: labels[(j + k) % 4], type: "TEXT", url: null, videoId: null, text: `${h} | Demo` })), { fieldType: "DESCRIPTION", label: labels[(k + 1) % 4], type: "TEXT", url: null, videoId: null, text: "750 TL üzeri ücretsiz kargo, 14 gün iade." }];
    return { creativeType: "TEXT", assets: JSON.stringify(assets), creativeSyncedAt: new Date() };
  };
  const level: Prisma.AdLevelDailyCreateManyInput[] = [];
  const entityImpr = new Map<string, { date: string; impressions: number }[]>();
  for (const [ci, { camp, acc, c, cbo }] of campInfo.entries()) {
    const names = SETS[c.p].slice(0, c.p === "meta" ? 2 + (ci % 2) : 2);
    const setW = names.map((_, k) => [0.55, 0.3, 0.15][k] * (0.85 + rnd() * 0.3));
    const sets = [];
    for (const [k, nm] of names.entries())
      sets.push(await db.adSet.create({ data: { adAccountId: acc.id, campaignId: camp.id, externalId: `${camp.id}-s${k + 1}`, kind: c.p === "meta" ? "adset" : "ad_group", name: nm, status: c.status === "PAUSED" ? (c.p === "meta" ? "CAMPAIGN_PAUSED" : "ENABLED") : c.p === "meta" ? "ACTIVE" : "ENABLED", dailyBudget: !cbo ? Math.round((c.budget * setW[k]) / setW.reduce((a, b) => a + b, 0)) : null, optimization: c.p === "meta" ? (c.objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" : c.objective === "OUTCOME_AWARENESS" ? "REACH" : "POST_ENGAGEMENT") : null } }));
    const adsBy = new Map<string, { id: string }[]>();
    for (const [si, st] of sets.entries()) {
      const list = [];
      const names2 = c.p === "meta" ? [ADS.meta[(ci + si) % 3], ADS.meta[(ci + si + 1) % 3]] : ADS.google; // türler setler arasında döner
      for (const [k, nm] of names2.entries())
        list.push(await db.ad.create({ data: { adAccountId: acc.id, campaignId: camp.id, adSetId: st.id, externalId: `${st.id}-a${k + 1}`, name: c.p === "meta" ? `${st.name} · ${nm}` : nm, status: st.status, adType: c.p === "google" ? "RESPONSIVE_SEARCH_AD" : null, ...demoCreative(c.p, nm, c.name, k) } }));
      adsBy.set(st.id, list);
    }
    for (const m of metrics.filter((x) => x.campaignId === camp.id)) {
      const sp = split(m.spend ?? 0, setW, false), im = split(m.impressions ?? 0, setW, true), cl = split(m.clicks ?? 0, setW, true), pu = split(m.purchases ?? 0, setW, true), va = split(m.purchaseValue ?? 0, setW, false);
      sets.forEach((st, k) => {
        level.push({ adAccountId: acc.id, level: "adset", entityId: st.id, adSetId: st.id, date: m.date, spend: sp[k], impressions: im[k], clicks: cl[k], purchases: pu[k], purchaseValue: va[k] });
        (entityImpr.get(st.id) ?? entityImpr.set(st.id, []).get(st.id)!).push({ date: m.date, impressions: im[k] });
        const ads = adsBy.get(st.id)!, aw = [0.62, 0.38];
        const s2 = split(sp[k], aw, false), i2 = split(im[k], aw, true), c2 = split(cl[k], aw, true), p2 = split(pu[k], aw, true), v2 = split(va[k], aw, false);
        ads.forEach((ad, j) => {
          level.push({ adAccountId: acc.id, level: "ad", entityId: ad.id, adSetId: st.id, adId: ad.id, date: m.date, spend: s2[j], impressions: i2[j], clicks: c2[j], purchases: p2[j], purchaseValue: v2[j] });
          (entityImpr.get(ad.id) ?? entityImpr.set(ad.id, []).get(ad.id)!).push({ date: m.date, impressions: i2[j] });
        });
      });
      (entityImpr.get(camp.id) ?? entityImpr.set(camp.id, []).get(camp.id)!).push({ date: m.date, impressions: m.impressions ?? 0 });
    }
  }
  for (let k = 0; k < level.length; k += 2000) await db.adLevelDaily.createMany({ data: level.slice(k, k + 2000) });
  // Dönem erişimi (yalnızca Meta): hazır dönemler için gösterim / frekans. Gerçekte Meta'dan tek dönem sorgusuyla gelir; demoda sentetiktir.
  const today = dayStr(new Date(now)), sh = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7, ms = `${today.slice(0, 7)}-01`, pme = sh(ms, -1);
  const PERIODS: [string, string][] = [[today, today], [sh(today, -1), sh(today, -1)], [sh(today, -6), today], [sh(today, -29), today], [sh(today, -89), today], [sh(today, -dow), today], [sh(today, -dow - 7), sh(today, -dow - 1)], [ms, today], [`${pme.slice(0, 7)}-01`, pme]];
  // Aynı aralığa denk gelen dönemler (ör. pazar günü "bu hafta" = "son 7 gün") bir kez yazılır.
  const uniq = [...new Map(PERIODS.map((p) => [p.join("|"), p])).values()];
  const reachRows: Prisma.AdReachPeriodCreateManyInput[] = [];
  for (const { camp, acc, c } of campInfo.filter((x) => x.c.p === "meta")) {
    const ents: [string, string][] = [["campaign", camp.id], ...(await db.adSet.findMany({ where: { campaignId: camp.id }, select: { id: true } })).map((x) => ["adset", x.id] as [string, string]), ...(await db.ad.findMany({ where: { campaignId: camp.id }, select: { id: true } })).map((x) => ["ad", x.id] as [string, string])];
    for (const [f, t] of uniq) for (const [lv, id] of ents) {
      const impr = (entityImpr.get(id) ?? []).filter((x) => x.date >= f && x.date <= t).reduce((a, x) => a + x.impressions, 0);
      if (!impr) { reachRows.push({ adAccountId: acc.id, level: lv, entityId: id, fromDate: f, toDate: t, reach: 0, frequency: null }); continue; }
      const days = Math.round((Date.parse(t) - Date.parse(f)) / DAY) + 1, freq = r2(Math.min(1.1 + days * 0.03 + rnd() * 0.3, 4.5) * (c.objective === "OUTCOME_AWARENESS" ? 0.8 : 1));
      reachRows.push({ adAccountId: acc.id, level: lv, entityId: id, fromDate: f, toDate: t, reach: Math.round(impr / freq), frequency: freq });
    }
  }
  await db.adReachPeriod.createMany({ data: reachRows });
  // Ürün düzeyi reklam verisi (DEMO). Platformun ürün kırılımı kampanya toplamının bir alt kümesidir (bir kısmı hiçbir ürüne yazılmaz).
  // Google: Shopping SKU ile, Performance Max varyant kimliğiyle raporlar; Meta katalog kampanyaları ürün kimliğiyle. Dönüşüm yalnızca Google'da.
  // Eşleşme testleri için: bir eski teklif anahtarı (eşleşmez) ve yalnızca adı tutan bir anahtar (olası eşleşme, sayılmaz).
  const PRODUCT_CAMPAIGNS: Record<string, { key: (p: P) => string; pick: (p: P, i: number) => boolean; conv: boolean }> = {
    "Google | Shopping - Elektronik": { key: (p) => p.sku, pick: (p) => p.cat === "Elektronik", conv: true },
    "Google | Performance Max": { key: (p) => p.variantId, pick: (_p, i) => i % 3 === 1, conv: true },
    "Facebook | Katalog Satış (DPA)": { key: (p) => p.productId, pick: (_p, i) => i % 2 === 0, conv: false },
    "Facebook | Elektronik Retargeting": { key: (p) => p.productId, pick: (p) => p.cat === "Elektronik", conv: false },
  };
  // Ürün ağırlığı ve dönüşüm verimi: bazı ürünler yüksek ROAS, bazıları harcama alıp dönüşüm getirmez.
  // Gerçekçi dağılım: harcamanın çoğunu birkaç ürün alır (uzun kuyruk).
  const weight = products.map((_, i) => (i % 6 === 1 ? 30 : i % 6 === 4 ? 10 : 0.3 + ((i * 7919) % 13) / 20));
  const yieldOf = products.map((_, i) => (i % 12 === 4 || i % 12 === 7 ? 0 : i % 12 === 1 ? 2.4 : i % 12 === 10 ? 0.25 : 0.6 + ((i * 31) % 10) / 10));
  const productRows: Prisma.AdProductDailyCreateManyInput[] = [];
  for (const { camp, acc } of campInfo) {
    const cfg = PRODUCT_CAMPAIGNS[camp.name];
    if (!cfg) continue;
    const chosen = products.map((p, i) => ({ p, i })).filter(({ p, i }) => cfg.pick(p, i));
    const tw = chosen.reduce((a, x) => a + weight[x.i], 0);
    for (const m of metrics.filter((x) => x.campaignId === camp.id)) {
      const share = 0.85; // kalan %15 ürün kırılımında görünmez
      for (const { p, i } of chosen) {
        const w = (weight[i] / tw) * share;
        const spend = r2((m.spend ?? 0) * w), impressions = Math.round((m.impressions ?? 0) * w), clicks = Math.round((m.clicks ?? 0) * w);
        if (!impressions && !spend) continue;
        const conversions = cfg.conv ? r2((m.purchases ?? 0) * w * yieldOf[i]) : null;
        productRows.push({ adAccountId: acc.id, campaignId: camp.id, date: m.date, productKey: cfg.key(p), productTitle: cfg.conv ? p.name : null, spend, impressions, clicks, conversions, conversionValue: conversions === null ? null : r2(conversions * (p.disc ?? p.sell)) });
      }
      if (cfg.conv) {
        const w = 0.02;
        productRows.push({ adAccountId: acc.id, campaignId: camp.id, date: m.date, productKey: "eski-teklif-9001", productTitle: "Kaldırılmış Ürün (eski teklif)", spend: r2((m.spend ?? 0) * w), impressions: Math.round((m.impressions ?? 0) * w), clicks: Math.round((m.clicks ?? 0) * w), conversions: 0, conversionValue: 0 });
        productRows.push({ adAccountId: acc.id, campaignId: camp.id, date: m.date, productKey: "gmc-teklif-77", productTitle: products[0].name, spend: r2((m.spend ?? 0) * w), impressions: Math.round((m.impressions ?? 0) * w), clicks: Math.round((m.clicks ?? 0) * w), conversions: 0, conversionValue: 0 });
      }
    }
  }
  await db.adProductDaily.createMany({ data: productRows });
  await db.adAccount.updateMany({ where: { id: { in: [metaAcc.id, googleAcc.id] } }, data: { productSyncedAt: new Date() } });
  console.log(`ürün düzeyi reklam: ${productRows.length} satır`);
  console.log(`reklam kırılımı: ${await db.adSet.count({ where: { adAccount: { integration: { userId } } } })} reklam seti/grubu, ${await db.ad.count({ where: { adAccount: { integration: { userId } } } })} reklam, ${level.length} günlük satır, ${reachRows.length} dönem erişimi`);
  const prop = await db.analyticsProperty.create({ data: { integrationId: ga4.id, propertyId: "999000111", name: "Demo E-Ticaret - GA4", accountName: "Demo Hesap", currency: "TRY", timezone: "Europe/Istanbul", websiteId: site.id, metricsSyncedAt: new Date() } });
  // Mağazanın günlük sipariş hacmiyle (~1,5) uyumlu oturum ve satın alma sayıları.
  const CH: [string, number, number, number][] = [["Organic Search", 70, 0.006, 980], ["Paid Social", 52, 0.007, 1050], ["Paid Search", 43, 0.01, 1300], ["Direct", 38, 0.009, 1100], ["Organic Social", 25, 0.003, 700], ["Email", 12, 0.013, 950], ["Referral", 10, 0.005, 900]];
  const ga: Prisma.AnalyticsDailyCreateManyInput[] = [];
  for (let d = 180; d >= 0; d--) for (const [ch, base, cvr, aov] of CH) {
    const sessions = Math.round(base * ([0, 6].includes(new Date(now - d * DAY).getDay()) ? 1.15 : 1) * (0.75 + rnd() * 0.5) * (0.85 + (1 - d / 180) * 0.3));
    const purchases = Math.floor(sessions * cvr * (0.7 + rnd() * 0.6) + rnd());
    ga.push({ propertyId: prop.id, date: dayStr(new Date(now - d * DAY)), channel: ch, sessions, users: Math.round(sessions * 0.82), keyEvents: Math.round(sessions * cvr * 6), purchases, revenue: r2(purchases * aov * (0.85 + rnd() * 0.3)) });
  }
  await db.analyticsDaily.createMany({ data: ga });
  // GA4 hunisi (DEMO): kanal satırları kaynak/ortam/kampanyaya bölünür; toplamlar kanal verisiyle aynıdır.
  const metaNames = AD_CAMPAIGNS.filter((c) => c.p === "meta").map((c) => c.name), gNames = AD_CAMPAIGNS.filter((c) => c.p === "google").map((c) => c.name);
  const SPLIT: Record<string, [string, string, string[], boolean][]> = {
    "Organic Search": [["google", "organic", ["(organic)"], false]], "Paid Social": [["facebook", "paid_social", metaNames.filter((n) => n.startsWith("Facebook")), false], ["instagram", "paid_social", metaNames.filter((n) => n.startsWith("Instagram")), false]], "Paid Search": [["google", "cpc", gNames, true]],
    Direct: [["(direct)", "(none)", ["(direct)"], false]], "Organic Social": [["instagram", "social", ["(referral)"], false]], Email: [["newsletter", "email", ["Haftalık Bülten"], false]], Referral: [["blog.ornek.test", "referral", ["(referral)"], false]],
  };
  const gaFunnel = new Map<string, Prisma.AnalyticsCampaignDailyCreateManyInput>();
  for (const row of ga) {
    // Kanalın tüm (kaynak, ortam, kampanya) parçaları tek seferde bölünür; kalan son parçaya eklenir, toplam kanalla aynı kalır.
    const parts = SPLIT[row.channel].flatMap(([source, medium, camps, gads]) => camps.map((camp) => ({ source, medium, camp, gads })));
    const w = parts.map(() => 0.5 + rnd()), tw = w.reduce((a, b) => a + b, 0);
    let leftS = row.sessions!, leftP = row.purchases!, leftR = row.revenue!;
    parts.forEach(({ source, medium, camp, gads }, i) => {
      const last = i === parts.length - 1;
      const sessions = last ? leftS : Math.floor(row.sessions! * (w[i] / tw)), purchases = last ? leftP : Math.min(leftP, Math.floor(row.purchases! * (w[i] / tw)));
      const revenue = last ? r2(leftR) : r2(row.revenue! * (purchases / Math.max(1, row.purchases!)));
      leftS -= sessions; leftP -= purchases; leftR -= revenue;
      const views = Math.round(sessions * (0.5 + rnd() * 0.15)), checkouts = Math.max(purchases, Math.round(sessions * (0.025 + rnd() * 0.015))), carts = Math.max(checkouts, Math.round(sessions * (0.06 + rnd() * 0.03)));
      const key = `${row.date}|${source}|${medium}|${camp}`;
      gaFunnel.set(key, { propertyId: prop.id, date: row.date, source, medium, campaign: gads ? "(not set)" : camp, googleAdsCampaign: gads ? camp : "(not set)", sessions, itemViews: Math.max(views, carts), addToCarts: carts, checkouts, purchases, revenue });
    });
  }
  await db.analyticsCampaignDaily.createMany({ data: [...gaFunnel.values()] });
  console.log(`huni: ${gaFunnel.size} GA4 kampanya satırı`);
  const spend = metrics.reduce((s, m) => s + (m.spend ?? 0), 0), value = metrics.reduce((s, m) => s + (m.purchaseValue ?? 0), 0);
  console.log(`reklam: ${AD_CAMPAIGNS.length} kampanya, ${metrics.length} günlük metrik, harcama ${r2(spend)} TL, reklam cirosu ${r2(value)} TL, ROAS ${(value / spend).toFixed(2)} · GA4 ${ga.length} satır`);

  // Kayıtlar ekranı: demo kurulum ve senkron günlüğü.
  await db.syncLog.createMany({ data: [
    { userId, level: "info", storeLabel: store.label, message: "Demo mağaza kuruldu: veriler sentetiktir, ikas'a bağlantı yapılmaz.", createdAt: new Date(now - 2 * 60_000) },
    ...products.filter((p) => p.stock > 0 && p.stock <= 5).map((p) => ({ userId, level: "warn", sku: p.sku, storeLabel: store.label, message: `Düşük stok: ${p.name} (${p.stock} adet)`, createdAt: new Date(now - int(1, 600) * 60_000) })),
  ] });
  console.log("tamam");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => db.$disconnect());
