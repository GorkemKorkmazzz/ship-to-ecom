// Finans motoru testleri (Aşama 1). Veritabanı ve ağ yok.
//   node --experimental-strip-types scripts/test-finance.ts
import assert from "node:assert/strict";
import { computeFinance, prorate, splitCents, type FinanceLine, type FinanceOrder } from "../src/lib/finance/engine.ts";
import { fromIkas, lineState } from "../src/lib/finance/sources/ikas.ts";
import { applicable, costAt, indexCosts, snapshotFor, type CostEntry } from "../src/lib/finance/cost-core.ts";
import { validateTxn, type NormalizedTxn } from "../src/lib/finance/ingest-core.ts";

let n = 0;
const line = (p: Partial<FinanceLine> = {}): FinanceLine => ({ key: "A", sku: "A", name: "Ürün A", quantity: 1, unitPrice: 100, state: "active", unitCost: 60, costSource: "current_buy_price", ...p });
const order = (lines: FinanceLine[], p: Partial<FinanceOrder> = {}): FinanceOrder => ({ id: `o${++n}`, storeId: "s1", source: "IKAS", currency: "TRY", status: "DELIVERED", draft: false, cancelled: false, orderTotal: lines.reduce((a, l) => a + (l.unitPrice ?? 0) * l.quantity, 0), orderedAt: new Date("2026-11-01"), lines, ...p });
const one = (orders: FinanceOrder[], opt?: Parameters<typeof computeFinance>[1]) => { const r = computeFinance(orders, opt); assert.equal(r.length, 1); return r[0]; };

// 1. Maliyeti eksik ürün: kâr yalnızca maliyeti bilinen satıştan; katman "eksik" (partial), tamamen eksikse null.
{
  const f = one([order([line(), line({ key: "B", sku: "B", unitCost: null, unitPrice: 50 })])]);
  assert.equal(f.layers.netSales.amount, 150);
  assert.equal(f.layers.productCost.state, "partial"); assert.equal(f.layers.productCost.amount, 60);
  assert.equal(f.layers.grossProfit.amount, 40, "maliyeti eksik B kâra katılmaz");
  assert.equal(f.costCoverage.uncostedNetSales, 50); assert.equal(f.costCoverage.uncostedLines, 1);
  assert.equal(f.products.find((p) => p.key === "B")!.grossProfit, null);
  const none = one([order([line({ unitCost: null })])]);
  assert.equal(none.layers.productCost.amount, null); assert.equal(none.layers.grossProfit.amount, null); assert.equal(none.layers.grossProfit.state, "missing");
}
// 3. Kısmi iade: iade edilen kalem net satıştan düşer, maliyet de düşmez/eklenmez.
{
  const f = one([order([line({ quantity: 2 }), line({ quantity: 1, state: "refunded" })])]);
  assert.equal(f.layers.grossSales.amount, 300); assert.equal(f.layers.netSales.amount, 200); assert.equal(f.deductions.refunded, 100);
  assert.equal(f.layers.productCost.amount, 120); assert.equal(f.layers.grossProfit.amount, 80);
  const p = f.products[0]; assert.equal(p.soldQty, 2); assert.equal(p.refundedQty, 1);
}
// 4. Tam iade: net satış 0, kâr 0 değil "veri yok" değil: satış yoksa maliyet katmanı missing.
{
  const f = one([order([line({ state: "refunded" })])]);
  assert.equal(f.layers.netSales.amount, 0); assert.equal(f.deductions.refunded, 100); assert.equal(f.layers.productCost.state, "missing"); assert.equal(f.netQty, 0);
}
// 5. İptal edilmiş sipariş: tüm kalemler iptal sayılır, sipariş sayısına ve sipariş toplamına girmez; taslak hiç görünmez.
{
  const f = one([order([line()]), order([line({ quantity: 3 })], { cancelled: true, status: "CANCELLED" }), order([line()], { draft: true, status: "DRAFT" })]);
  assert.equal(f.orders, 1); assert.equal(f.orderTotal, 100); assert.equal(f.deductions.cancelled, 300); assert.equal(f.layers.netSales.amount, 100); assert.equal(f.grossQty, 4);
}
// 6-7. İndirim: kalem fiyatı kaynağın indirim sonrası fiyatıdır; motor ek indirim düşmez (doğrulanmış sipariş indirimi alanı yok).
{
  const f = one([order([line({ unitPrice: 80 })])]);
  assert.equal(f.layers.netSales.amount, 80); assert.ok(f.layers.netSales.note.includes("Sipariş düzeyi indirim ayrıca gösterilir"));
}
// 10. Farklı para birimleri toplanmaz; ana para birimi net satışı yüksek olandır.
{
  const r = computeFinance([order([line({ unitPrice: 100 })]), order([line({ unitPrice: 30 })], { currency: "USD" }), order([line({ unitPrice: 50 })])]);
  assert.equal(r.length, 2); assert.equal(r[0].currency, "TRY"); assert.equal(r[0].layers.netSales.amount, 150); assert.equal(r[1].currency, "USD"); assert.equal(r[1].layers.netSales.amount, 30);
}
// 12. Birden fazla mağazada aynı SKU: aynı ürün anahtarında birleşir, her kalem kendi mağazasının maliyetiyle.
{
  const f = one([order([line({ unitCost: 60 })], { storeId: "s1" }), order([line({ unitCost: 70 })], { storeId: "s2" })]);
  const p = f.products[0]; assert.equal(f.products.length, 1); assert.equal(p.soldQty, 2); assert.equal(p.cost, 130); assert.equal(p.grossProfit, 70); assert.equal(p.margin, 35);
}
// 13. Satış giderleri verilirse katkı kârı hesaplanır; verilmezse null (0 sayılmaz). İşletme gideri yoksa işletme kârı null.
{
  const noExp = one([order([line()])]);
  assert.equal(noExp.layers.salesExpenses.amount, null); assert.equal(noExp.layers.contribution.amount, null); assert.equal(noExp.layers.operatingProfit.amount, null);
  const withExp = one([order([line()])], { salesExpenses: new Map([["TRY", 15.5]]) });
  assert.equal(withExp.layers.contribution.amount, 24.5); assert.equal(withExp.layers.operatingProfit.amount, null);
  const full = one([order([line()])], { salesExpenses: new Map([["TRY", 15.5]]), operatingExpenses: new Map([["TRY", 4.5]]) });
  assert.equal(full.layers.operatingProfit.amount, 20);
  // Maliyet eksikse giderler olsa da katkı kârı kesin gösterilmez.
  assert.equal(one([order([line({ unitCost: null })])], { salesExpenses: new Map([["TRY", 1]]) }).layers.contribution.amount, null);
}
// 14. Eksik fiyat: fiyatı olmayan kalem tutarlara girmez, brüt satış "eksik" işaretlenir.
{
  const f = one([order([line(), line({ unitPrice: null })])]);
  assert.equal(f.layers.grossSales.amount, 100); assert.equal(f.layers.grossSales.state, "partial"); assert.equal(f.deductions.missingPrice, 1);
}
// 15. Sıfır ve negatif tutarlar (ör. hediye ürün, düzeltme kalemi) olduğu gibi toplanır; kuruş hassasiyeti korunur.
{
  const f = one([order([line({ unitPrice: 0, unitCost: 10 }), line({ key: "N", sku: "N", unitPrice: -20, unitCost: 0 })])]);
  assert.equal(f.layers.netSales.amount, -20); assert.equal(f.layers.grossProfit.amount, -30);
  const r = one([order([line({ unitPrice: 0.1, unitCost: 0 }), line({ key: "B", sku: "B", unitPrice: 0.2, unitCost: 0 })])]);
  assert.equal(r.layers.netSales.amount, 0.3, "0.1 + 0.2 kayan nokta hatası vermez");
}
// ikas eşlemesi: kalem durumları ve sipariş durumu.
{
  assert.equal(lineState("CANCELLED"), "cancelled"); assert.equal(lineState("REFUNDED"), "refunded");
  assert.equal(lineState("REFUND_REQUESTED"), "active", "sonuçlanmamış iade talebi satıştır"); assert.equal(lineState(null), "active");
  const o = fromIkas({ id: "x", storeId: "s1", status: "CANCELLED", currency: "TRY", totalFinalPrice: 10, orderedAt: null, lines: [{ sku: "A", name: "", quantity: 1, finalPrice: 10, status: "DELIVERED" }] },
    () => ({ key: "A-ORTAK", name: "Ad", unitCost: 4, costSource: "current_buy_price" }));
  assert.equal(o.cancelled, true); assert.equal(o.lines[0].key, "A-ORTAK"); assert.equal(o.lines[0].name, "Ad");
  assert.equal(fromIkas({ id: "y", storeId: "s1", status: "DRAFT", currency: "TRY", totalFinalPrice: 0, orderedAt: null, lines: [] }, () => ({ key: "", name: null, unitCost: null, costSource: null })).draft, true);
}
// 2. Maliyet değişince geçmiş siparişler korunur: sipariş anındaki dönem kullanılır; sınırda yeni dönem geçerlidir.
{
  const d = (x: string) => new Date(`${x}T00:00:00Z`);
  const h: CostEntry[] = [
    { storeId: "s1", sku: "A", unitCost: 50, currency: "TRY", validFrom: d("2026-01-01"), validTo: d("2026-06-01"), source: "MANUAL" },
    { storeId: "s1", sku: "A", unitCost: 70, currency: "TRY", validFrom: d("2026-06-01"), validTo: null, source: "IKAS_BUY_PRICE" },
  ];
  assert.equal(costAt(h, d("2026-03-15"))!.unitCost, 50, "eski sipariş eski maliyetle");
  assert.equal(costAt(h, d("2026-06-01"))!.unitCost, 70, "sınır: yeni dönem");
  assert.equal(costAt(h, d("2026-12-01"))!.unitCost, 70);
  assert.equal(costAt(h, d("2025-12-31")), null, "geçmiş maliyet bilinmiyorsa bugünkü uygulanmaz");
  const idx = indexCosts(h);
  assert.equal(snapshotFor(idx, "s1", "A", d("2026-03-15"), "TRY").unitCost, 50);
  assert.equal(snapshotFor(idx, "s1", "A", d("2025-05-01"), "TRY").unitCost, null);
  assert.equal(snapshotFor(idx, "s2", "A", d("2026-03-15"), "TRY").unitCost, null, "başka mağazanın maliyeti kullanılmaz");
  // Para birimi: farklı ya da bilinmeyen (null) para birimindeki maliyet satışa uygulanmaz.
  assert.equal(applicable(h[0], "USD"), false);
  assert.equal(applicable({ ...h[0], currency: null }, "TRY"), false);
  assert.equal(snapshotFor(idx, "s1", "A", d("2026-03-15"), "USD").unitCost, null);
  // Tahmin ayrı: maliyeti eksik kalem kesin kâra girmez, tahmine güncel maliyetle girer.
  const f = one([order([line({ unitCost: 60 }), line({ key: "B", sku: "B", unitCost: null, estimateCost: 30, unitPrice: 50 })])]);
  assert.equal(f.layers.grossProfit.amount, 40); assert.equal(f.layers.grossProfit.state, "partial");
  assert.equal(f.estimate.grossProfit, 60, "150 − (60 + 30)"); assert.equal(f.estimate.estimatedLines, 1);
  // Tahmin için de maliyet yoksa tahmin üretilmez.
  assert.equal(one([order([line({ unitCost: null, estimateCost: null })])]).estimate.grossProfit, null);
}
// 16. Paylaşılan stok: iki mağaza aynı ortak ürün anahtarında, her biri kendi maliyet geçmişiyle.
{
  const d = new Date("2026-03-01T00:00:00Z");
  const idx = indexCosts([
    { storeId: "s1", sku: "TS-1", unitCost: 40, currency: "TRY", validFrom: new Date("2026-01-01"), validTo: null, source: "MANUAL" },
    { storeId: "s2", sku: "TS-1-B", unitCost: 45, currency: "TRY", validFrom: new Date("2026-01-01"), validTo: null, source: "MANUAL" },
  ]);
  const mk = (storeId: string, sku: string) => line({ key: "ORTAK", sku, unitCost: snapshotFor(idx, storeId, sku, d, "TRY").unitCost });
  const f = one([order([mk("s1", "TS-1")], { storeId: "s1" }), order([mk("s2", "TS-1-B")], { storeId: "s2" })]);
  assert.equal(f.products.length, 1); assert.equal(f.products[0].cost, 85); assert.equal(f.products[0].grossProfit, 115);
}
// 3-4 (Aşama 3). İade ödemesi kaydı varsa iade tutarı ödemeden alınır; aynı iade kalem durumundan ikinci kez düşülmez.
{
  const withPay = one([order([line({ quantity: 2 }), line({ state: "refunded" })], { refundPayments: 80 })]);
  assert.equal(withPay.deductions.refunded, 80, "kalem tutarı (100) değil ödeme (80) düşülür");
  assert.equal(withPay.layers.netSales.amount, 220); assert.equal(withPay.refundSource.payments, 1); assert.equal(withPay.refundSource.lineStatus, 0);
  assert.equal(withPay.products[0].refundedQty, 1);
  const noPay = one([order([line({ quantity: 2 }), line({ state: "refunded" })])]);
  assert.equal(noPay.deductions.refunded, 100); assert.equal(noPay.refundSource.lineStatus, 1);
  // İptal edilmiş siparişte iade ödemesi düşülmez (zaten satıştan çıkmıştır).
  assert.equal(one([order([line()], { cancelled: true, refundPayments: 100 })]).deductions.refunded, 0);
}
// 6-7. Ürün indirimi (liste − satış fiyatı) ve sipariş düzeyi düzeltme (toplam − kalem net toplamı − kargo).
{
  const f = one([order([line({ unitPrice: 80, listPrice: 100, quantity: 2 })], { orderTotal: 160 - 20 + 30, linesNetTotal: 160, shippingIncome: 30 })]);
  assert.equal(f.discounts.product, 40); assert.equal(f.discounts.order, 20); assert.equal(f.shipping.income, 30);
  // Liste fiyatı bilinmeyen kalem varsa ürün indirimi null (kısmi toplam kesin gösterilmez); kargo bilgisi yoksa sipariş indirimi türetilmez.
  const g = one([order([line({ listPrice: 120 }), line({ key: "B", sku: "B", listPrice: null })], { linesNetTotal: 200 })]);
  assert.equal(g.discounts.product, null); assert.equal(g.discounts.order, null);
}
// 8-9. KDV: kalem ve gider KDV'si ayrı toplanır; satış tutarından düşülmez ya da eklenmez (dahil/hariç bilgisi doğrulanmadı).
{
  const f = one([order([line({ unitPrice: 120, taxAmount: 20 })], { shippingIncome: 0, shippingTax: 0 })], { expenses: [{ currency: "TRY", type: "PAYMENT_FEE", amount: 6, taxAmount: 1, orderId: "x" }] });
  assert.equal(f.layers.netSales.amount, 120, "KDV düşülmez"); assert.equal(f.tax.lines, 20); assert.equal(f.tax.expenses, 1); assert.equal(f.tax.linesKnown, 1);
}
// 13-14. Satış giderleri finansal kayıtlardan: tür dökümü, para birimi ayrımı, kapsama göre "eksik" durumu.
{
  const o1 = order([line()], { id: "e1" }), o2 = order([line()], { id: "e2" });
  const exp = [
    { currency: "TRY", type: "MARKETPLACE_COMMISSION", amount: 15, taxAmount: 2.5, orderId: "e1" },
    { currency: "TRY", type: "SHIPPING_COST", amount: 5, taxAmount: null, orderId: "e1" },
    { currency: "USD", type: "SHIPPING_COST", amount: 99, taxAmount: null, orderId: null },
  ];
  const f = one([o1, o2], { expenses: exp });
  assert.equal(f.layers.salesExpenses.amount, 20, "USD gider TRY'ye eklenmez"); assert.equal(f.layers.salesExpenses.state, "partial", "2 siparişin 1'inde gider var");
  assert.deepEqual(f.expenses.byType, { MARKETPLACE_COMMISSION: 15, SHIPPING_COST: 5 });
  assert.equal(f.layers.contribution.amount, 80 - 20); assert.equal(f.layers.contribution.state, "partial");
  assert.equal(f.layers.operatingProfit.amount, null, "gider eksikken işletme kârı gösterilmez");
  const full = one([o1, o2], { expenses: [...exp.slice(0, 2), { currency: "TRY", type: "SHIPPING_COST", amount: 5, taxAmount: null, orderId: "e2" }], operatingExpenses: new Map([["TRY", 10]]) });
  assert.equal(full.layers.salesExpenses.state, "ok"); assert.equal(full.layers.operatingProfit.amount, 80 - 25 - 10);
}
// 11. Finansal kayıt doğrulaması (içe aktarımda mükerrer/hatalı kaydı engeller; veritabanı tekilliği ayrıca test edildi).
{
  const ok: NormalizedTxn = { source: "TRENDYOL", externalId: "TY-1", type: "MARKETPLACE_COMMISSION", direction: "DEBIT", amount: 10, currency: "TRY", occurredAt: new Date("2026-11-01") };
  assert.equal(validateTxn(ok), null);
  assert.equal(validateTxn({ ...ok, amount: 0 }), null, "sıfır tutar geçerli");
  assert.ok(validateTxn({ ...ok, amount: -1 })); assert.ok(validateTxn({ ...ok, externalId: " " })); assert.ok(validateTxn({ ...ok, currency: "tl" }));
  assert.ok(validateTxn({ ...ok, taxAmount: 11 }), "KDV tutardan büyük olamaz"); assert.ok(validateTxn({ ...ok, fxRate: 34 }), "kur varsa kaynak para birimi ve tarih zorunlu");
  assert.equal(validateTxn({ ...ok, fxRate: 34, fxCurrency: "USD", fxDate: new Date("2026-11-01") }), null);
  assert.ok(validateTxn({ ...ok, type: "BILINMEYEN" as never })); assert.ok(validateTxn({ ...ok, source: "EBAY" as never }));
}
// Aşama 4. Gider dağıtımı: yöntemler, kuruş korunumu, dağıtılamayan gider.
{
  assert.deepEqual(splitCents(100, [1, 1, 1]), [34, 33, 33], "toplam birebir korunur");
  assert.equal(splitCents(100, [0, 0]), null); assert.equal(splitCents(100, [1, -1]), null);
  const lines = () => [line({ key: "A", sku: "A", unitPrice: 300, quantity: 1 }), line({ key: "B", sku: "B", unitPrice: 100, quantity: 3, unitCost: 20 })];
  const run = (exp: object) => one([order(lines(), { id: "g1" })], { expenses: [{ currency: "TRY", type: "SHIPPING_COST", amount: 40, taxAmount: null, orderId: "g1", ...exp }] });
  const pa = (f: ReturnType<typeof run>, k: string) => f.products.find((p) => p.key === k)!;
  const rev = run({});
  assert.equal(pa(rev, "A").allocatedExpenses, 20); assert.equal(pa(rev, "B").allocatedExpenses, 20, "satış tutarı 300/300");
  assert.equal(rev.allocation.allocated, 40); assert.equal(rev.allocation.unallocated, 0); assert.deepEqual(rev.allocation.byMethod, { REVENUE: 40 });
  const qty = run({ method: "QUANTITY" });
  assert.equal(pa(qty, "A").allocatedExpenses, 10); assert.equal(pa(qty, "B").allocatedExpenses, 30, "adet 1/3");
  const w = run({ method: "WEIGHT" });
  assert.equal(w.allocation.allocated, 0); assert.deepEqual(w.allocation.unallocatedReasons, { "Ağırlık bilgisi yok": 40 }, "ağırlık yoksa dağıtılmaz, kaybolmaz");
  const wOk = one([order([line({ key: "A", sku: "A", weight: 2 }), line({ key: "B", sku: "B", weight: 1, quantity: 2 })], { id: "g2" })], { expenses: [{ currency: "TRY", type: "SHIPPING_COST", amount: 40, taxAmount: null, orderId: "g2", method: "WEIGHT" }] });
  assert.equal(wOk.products.find((p) => p.key === "A")!.allocatedExpenses, 20);
  const man = run({ method: "MANUAL", manual: [{ sku: "A", amount: 25 }] });
  assert.equal(pa(man, "A").allocatedExpenses, 25); assert.equal(pa(man, "B").allocatedExpenses, 0);
  assert.equal(man.allocation.unallocated, 15); assert.deepEqual(man.allocation.unallocatedReasons, { "Elle dağıtımda ürüne yazılmayan kalan": 15 });
  // Elle dağıtım toplamı gideri aşarsa orantılı küçültülür (gider tutarından fazlası yazılmaz).
  const over = run({ method: "MANUAL", manual: [{ sku: "A", amount: 60 }, { sku: "B", amount: 20 }] });
  assert.equal(pa(over, "A").allocatedExpenses + pa(over, "B").allocatedExpenses, 40);
  // Siparişe bağlı olmayan ya da satılan kalemi kalmamış siparişin gideri dağıtılmaz ama satış giderlerinde kalır.
  const un = one([order(lines(), { id: "g3" }), order([line({ state: "refunded" })], { id: "g4" })], { expenses: [
    { currency: "TRY", type: "OTHER", amount: 7, taxAmount: null, orderId: null },
    { currency: "TRY", type: "OTHER", amount: 5, taxAmount: null, orderId: "g4" },
  ] });
  assert.equal(un.layers.salesExpenses.amount, 12); assert.equal(un.allocation.allocated, 0); assert.equal(un.allocation.unallocated, 12);
  // Ürün katkı kârı = brüt kâr − dağıtılan gider − reklam.
  assert.equal(pa(rev, "A").contribution, 300 - 60 - 20); assert.equal(pa(rev, "B").contribution, 300 - 60 - 20);
}
// Aşama 4. Reklam: ürünle eşleşen harcama ürüne ve katkı kârına; eşleşmeyen işletme kârından düşülür; veri yoksa katmanlarda belirtilir.
{
  const o = order([line({ key: "A", sku: "A", unitPrice: 200 }), line({ key: "B", sku: "B", unitPrice: 100, unitCost: 30 })], { id: "r1" });
  const ex = [{ currency: "TRY", type: "PAYMENT_FEE", amount: 10, taxAmount: null, orderId: "r1" }];
  const f = one([o], { expenses: ex, ads: [{ currency: "TRY", key: "A", amount: 25 }, { currency: "TRY", key: "Z", amount: 5 }, { currency: "TRY", key: null, amount: 40 }, { currency: "USD", key: null, amount: 99 }], operatingExpenses: new Map([["TRY", 50]]) });
  assert.equal(f.ads.attributed, 30); assert.equal(f.ads.attributedNoSales, 5, "satışı olmayan ürünün reklamı"); assert.equal(f.ads.unattributed, 40, "USD karışmaz");
  assert.equal(f.products.find((p) => p.key === "A")!.adSpend, 25);
  // Brüt kâr: (200−60) + (100−30) = 210; katkı = 210 − 10 − 30 = 170; işletme = 170 − 40 − 50 = 80.
  assert.equal(f.layers.grossProfit.amount, 210); assert.equal(f.layers.contribution.amount, 170); assert.equal(f.layers.operatingProfit.amount, 80);
  const noAds = one([o], { expenses: ex });
  assert.equal(noAds.ads.known, false); assert.ok(noAds.layers.contribution.note.includes("Reklam gideri verisi yok"));
  assert.equal(noAds.layers.operatingProfit.amount, null); assert.ok(noAds.layers.operatingProfit.note.includes("0 kabul edilmez"));
}
// Aşama 4. İşletme gideri döneme gün bazında paylaştırılır.
{
  const t = (x: string) => new Date(x);
  const nov = [t("2026-11-01T00:00:00+03:00"), t("2026-11-30T23:59:59+03:00")] as const;
  assert.equal(prorate(18000, ...nov, t("2026-11-01T00:00:00+03:00"), t("2026-11-15T23:59:59.999+03:00")), 9000, "15/30");
  assert.equal(prorate(18000, ...nov, t("2026-10-01T00:00:00+03:00"), t("2026-12-31T23:59:59.999+03:00")), 18000, "tamamı, fazlası değil");
  assert.equal(prorate(18000, ...nov, t("2026-12-01T00:00:00+03:00"), t("2026-12-31T23:59:59.999+03:00")), 0, "kesişme yok");
  assert.equal(prorate(3100, t("2026-10-01T00:00:00+03:00"), t("2026-10-31T23:59:59+03:00"), t("2026-10-16T00:00:00+03:00"), t("2026-11-15T23:59:59.999+03:00")), 1600, "16/31");
}
// Belirleyicilik.
assert.deepEqual(computeFinance([order([line()], { id: "d" })]), computeFinance([order([line()], { id: "d" })]));
console.log("finans motoru: tüm testler geçti");
