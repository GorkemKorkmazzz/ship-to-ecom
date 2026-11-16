// Finans Merkezi verisi. Hesaplama merkezi motordadır (engine.ts); bu dosya yalnızca seçimleri uygular ve görünüm için toplar.
// Para birimleri karıştırılmaz: tüm bileşenler seçili tek para birimiyle çalışır.
import { buildAnalysis, loadFinanceRun } from "../analysis";
import { db } from "../db";
import { imageUrl } from "../pricing";
import { prevRangeOf, type AdRange } from "../ads/report";
import { computeFinance, type FinanceOrder } from "./engine";

export const CHANNELS = [["IKAS", "ikas"], ["TRENDYOL", "Trendyol"], ["HEPSIBURADA", "Hepsiburada"], ["AMAZON", "Amazon"], ["N11", "N11"]] as const;
export type Channel = (typeof CHANNELS)[number][0];
const DAY = 86400000;
const trDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const toDates = (r: { from: string; to: string }) => {
  const start = new Date(`${r.from}T00:00:00+03:00`), end = new Date(Math.min(Date.now(), new Date(`${r.to}T23:59:59.999+03:00`).getTime()));
  return { start, end, days: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY)) };
};
const pct = (now: number | null, prev: number | null) => (now === null || prev === null || !prev ? null : ((now - prev) / Math.abs(prev)) * 100);

type Opt = { storeId?: string | null; channel?: string | null; currency?: string | null; compare?: boolean };

/** Kanal filtresi: siparişin kaynağı. Bugün yalnızca ikas mağazaları bağlanabildiği için diğer kanallarda sipariş yoktur. */
const channelOf = (o: FinanceOrder) => (o.source === "IKAS" ? "IKAS" : o.source);

export async function buildFinanceDashboard(userId: string, range: AdRange, opt: Opt) {
  const cur = toDates(range), prevR = prevRangeOf(range), prev = toDates(prevR);
  const channel = CHANNELS.some(([k]) => k === opt.channel) ? (opt.channel as Channel) : null;
  const [run, runPrev] = await Promise.all([loadFinanceRun(userId, cur, { storeId: opt.storeId }), opt.compare === false ? null : loadFinanceRun(userId, prev, { storeId: opt.storeId })]);
  const filterRun = (r: NonNullable<typeof runPrev>) => {
    const orders = channel ? r.finOrders.filter((o) => channelOf(o) === channel) : r.finOrders;
    const ids = new Set(orders.map((o) => o.id));
    // Kanal seçiliyse yalnızca o kanalın siparişlerine bağlı giderler; reklam ve işletme giderleri kanal kırılımı olmadığından kanal seçiliyken dahil edilmez.
    const expenses = channel ? r.engineOpt.expenses.filter((e) => e.orderId && ids.has(e.orderId)) : r.engineOpt.expenses;
    return { orders, opt: { ...r.engineOpt, expenses, ads: channel ? null : r.engineOpt.ads, operatingExpenses: channel ? null : r.engineOpt.operatingExpenses } };
  };
  const f = filterRun(run), fp = runPrev ? filterRun(runPrev) : null;
  const fin = computeFinance(f.orders, f.opt), finPrev = fp ? computeFinance(fp.orders, fp.opt) : [];
  const currencies = fin.map((x) => x.currency);
  const currency = opt.currency && currencies.includes(opt.currency) ? opt.currency : currencies[0] ?? "TRY";
  const m = fin.find((x) => x.currency === currency) ?? null, mp = finPrev.find((x) => x.currency === currency) ?? null;

  // ── Günlük seri (aynı motor, gün gün). Reklam: o günün kampanya düzeyi harcaması (seçili para biriminde).
  const days: string[] = [];
  for (let t = new Date(`${range.from}T12:00:00Z`).getTime(); t <= new Date(`${range.to}T12:00:00Z`).getTime(); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
  const byDay = new Map<string, FinanceOrder[]>();
  for (const o of f.orders) if (o.currency === currency) byDay.set(trDay(o.orderedAt), [...(byDay.get(trDay(o.orderedAt)) ?? []), o]);
  const adDaily = new Map<string, number>();
  if (!channel) {
    const accounts = await db.adAccount.findMany({ where: { selected: true, currency, integration: { userId } }, select: { id: true } });
    if (accounts.length) for (const r of await db.adDailyMetric.groupBy({ by: ["date"], where: { adAccountId: { in: accounts.map((a) => a.id) }, date: { gte: range.from, lte: range.to } }, _sum: { spend: true } })) adDaily.set(r.date, r._sum.spend ?? 0);
  }
  const series = days.map((d) => {
    const os = byDay.get(d) ?? [];
    const ids = new Set(os.map((o) => o.id));
    const r = os.length ? computeFinance(os, { expenses: f.opt.expenses.filter((e) => e.currency === currency && e.orderId && ids.has(e.orderId)) })[0] : null;
    const net = r?.layers.netSales.amount ?? 0, cost = r?.layers.productCost.amount ?? 0, se = r?.layers.salesExpenses.amount ?? 0, ad = adDaily.get(d) ?? 0;
    const complete = !r || r.layers.productCost.state === "ok";
    return {
      day: d, revenue: r?.orderTotal ?? 0, net, gross: r?.layers.grossProfit.amount ?? 0, ad, totalCost: Math.round((cost + se + ad) * 100) / 100,
      // Katkı (grafik): net satış − ürün maliyeti − satış giderleri − o günün reklam harcaması; maliyeti eksik günlerde gösterilmez.
      contribution: complete ? Math.round((net - cost - se - ad) * 100) / 100 : null,
    };
  });

  // ── KPI'lar
  const L = m?.layers, LP = mp?.layers;
  const adTotal = m && m.ads.known ? m.ads.attributed + m.ads.unattributed : null, adPrev = mp && mp.ads.known ? mp.ads.attributed + mp.ads.unattributed : null;
  const margin = (x: typeof m) => (!x || !x.layers.netSales.amount ? null : x.layers.contribution.amount !== null ? (x.layers.contribution.amount / x.layers.netSales.amount) * 100 : x.layers.grossProfit.amount !== null ? (x.layers.grossProfit.amount / x.layers.netSales.amount) * 100 : null);
  const marginBasis = L?.contribution.amount != null ? "katkı" : "brüt";
  const kpis = {
    revenue: { value: m?.orderTotal ?? null, change: pct(m?.orderTotal ?? null, mp?.orderTotal ?? null) },
    net: { value: L?.netSales.amount ?? null, change: pct(L?.netSales.amount ?? null, LP?.netSales.amount ?? null) },
    gross: { value: L?.grossProfit.amount ?? null, change: pct(L?.grossProfit.amount ?? null, LP?.grossProfit.amount ?? null), state: L?.grossProfit.state ?? "missing" },
    contribution: { value: L?.contribution.amount ?? null, change: pct(L?.contribution.amount ?? null, LP?.contribution.amount ?? null), state: L?.contribution.state ?? "missing", note: L?.contribution.note ?? "" },
    ads: { value: adTotal, change: pct(adTotal, adPrev) },
    margin: { value: margin(m), change: margin(m) !== null && margin(mp) !== null ? margin(m)! - margin(mp)! : null, basis: marginBasis },
  };

  // ── Kâr dağılımı (gider kırılımı): yüzdeler toplam gidere göre.
  const parts = [
    { key: "cost", label: "Ürün Maliyeti", value: L?.productCost.amount ?? null, color: "#633BFF", note: L?.productCost.state === "partial" ? "maliyeti eksik kalemler hariç" : null },
    { key: "sales", label: "Satış Giderleri", value: L?.salesExpenses.amount ?? null, color: "#F59E0B", note: L?.salesExpenses.state === "partial" ? "kayıtlı giderler" : null },
    { key: "ads", label: "Reklam Giderleri", value: adTotal, color: "#10B981", note: null },
    { key: "other", label: "Diğer Giderler", value: m?.operating.expenses ?? null, color: "#94A3B8", note: "işletme giderleri" },
  ];
  const partsTotal = parts.reduce((a, p) => a + (p.value ?? 0), 0);

  // ── Satış kanalları
  const channels = CHANNELS.map(([k, label]) => {
    const os = run.finOrders.filter((o) => channelOf(o) === k && o.currency === currency);
    if (!os.length) return { key: k, label, connected: run.stores.some((s) => s.platform.toUpperCase() === k), orders: 0, net: null, cost: null, commission: null, shipping: null, ads: null, contribution: null, margin: null };
    const ids = new Set(os.map((o) => o.id));
    const r = computeFinance(os, { ...run.engineOpt, expenses: run.engineOpt.expenses.filter((e) => e.orderId && ids.has(e.orderId)), operatingExpenses: null })[0];
    const by = r.expenses.byType;
    const ad = r.ads.known ? r.ads.attributed + r.ads.unattributed : null;
    const contrib = r.layers.contribution.amount !== null && ad !== null ? r.layers.contribution.amount - r.ads.unattributed : r.layers.contribution.amount;
    return {
      key: k, label, connected: true, orders: r.orders, net: r.layers.netSales.amount, cost: r.layers.productCost.amount,
      // Komisyon: pazaryeri komisyonu + ödeme kuruluşu komisyonu (kayıtlıysa).
      commission: (by.MARKETPLACE_COMMISSION ?? 0) + (by.PAYMENT_FEE ?? 0) || null,
      shipping: (by.SHIPPING_COST ?? 0) + (by.RETURN_SHIPPING ?? 0) || null, ads: ad, contribution: contrib, contributionState: r.layers.contribution.state,
      margin: contrib !== null && r.layers.netSales.amount ? (contrib / r.layers.netSales.amount) * 100 : null,
    };
  });

  // ── Ürünler, stok (mevcut analiz yapısından; aynı yükleme kullanılır)
  const a = await buildAnalysis(userId, cur, 30, { run });
  const images = new Map<string, string | null>();
  const merchants = new Map(run.stores.map((s) => [s.id, s.merchantId]));
  const imgRows = await db.storeVariant.findMany({ where: { storeId: { in: run.storeIds } }, select: { storeId: true, matchSku: true, imageId: true } });
  for (const v of imgRows) if (!images.get(v.matchSku)) images.set(v.matchSku, imageUrl(merchants.get(v.storeId), v.imageId, 120));
  const prods = a.urunler.filter((p) => p.paraBirimi === currency).map((p) => ({ ...p, image: images.get(p.sku) ?? null }));
  const productTabs = {
    kazandiran: prods.filter((p) => p.kar !== null && p.kar > 0).sort((x, y) => y.kar! - x.kar!).slice(0, 8),
    satan: [...prods].sort((x, y) => y.adet - x.adet).slice(0, 8),
    dusukMarj: prods.filter((p) => p.marj !== null && p.marj >= 0).sort((x, y) => x.marj! - y.marj!).slice(0, 8),
    zarar: prods.filter((p) => p.kar !== null && p.kar < 0).sort((x, y) => x.kar! - y.kar!).slice(0, 8),
  };
  // Stok değeri: anahtar başına stok × güncel birim maliyet (açık maliyet kaydı, yoksa ikas alış fiyatı). Maliyeti bilinmeyen adet ayrı sayılır.
  const open = await db.productCostHistory.findMany({ where: { userId, storeId: { in: run.storeIds }, validTo: null }, select: { storeId: true, sku: true, unitCost: true, currency: true } });
  const openOf = new Map(open.map((o) => [`${o.storeId}|${o.sku}`, o]));
  const unitCostOf = new Map<string, number>();
  for (const v of run.variants) {
    const o = openOf.get(`${v.storeId}|${v.sku}`);
    const c = o && o.currency === currency ? o.unitCost : v.buyPrice;
    if (c != null && !unitCostOf.has(v.matchSku || v.sku)) unitCostOf.set(v.matchSku || v.sku, c);
  }
  const minStock = new Map<string, number>();
  for (const v of run.variants) if (v.matchSku) minStock.set(v.matchSku, Math.min(minStock.get(v.matchSku) ?? Infinity, v.currentStock));
  const sharedOf = new Map(run.shared.map((x) => [x.sku, x.sharedStock]));
  let units = 0, value = 0, unknownUnits = 0;
  const nameOf = new Map(run.variants.map((v) => [v.matchSku || v.sku, v.productName]));
  const perKey = new Map([...a.urunler, ...a.kritik, ...a.siparisOnerileri].map((p) => [p.sku, p]));
  const stockRows: { sku: string; name: string; image: string | null; stock: number; unitCost: number | null; value: number | null; daily: number; daysLeft: number | null; critical: boolean }[] = [];
  const criticalSet = new Set(a.kritik.map((p) => p.sku));
  for (const k of new Set([...minStock.keys()])) {
    const st = Math.max(0, sharedOf.get(k) ?? minStock.get(k) ?? 0);
    units += st;
    const c = unitCostOf.get(k);
    if (c == null) unknownUnits += st; else value += st * c;
    const p = perKey.get(k);
    stockRows.push({ sku: k, name: nameOf.get(k) ?? k, image: images.get(k) ?? null, stock: st, unitCost: c ?? null, value: c == null ? null : Math.round(st * c * 100) / 100, daily: p?.gunlukSatis ?? 0, daysLeft: p?.kalanGun ?? null, critical: criticalSet.has(k) });
  }
  stockRows.sort((x, y) => (y.value ?? -1) - (x.value ?? -1));
  const dailyQty = (m?.netQty ?? 0) / cur.days;
  const stock = {
    units, value: Math.round(value * 100) / 100, unknownUnits, critical: a.ozet.kritikStok,
    days: dailyQty > 0 ? Math.floor(units / dailyQty) : null, costKnownShare: units ? ((units - unknownUnits) / units) * 100 : null,
    basis: "Stok değeri güncel birim maliyetle (maliyet geçmişindeki açık kayıt, yoksa ikas alış fiyatı) hesaplanır.",
  };

  // ── Uyarılar (kural tabanlı; yalnızca verinin söylediği)
  const lastSync = run.stores.map((s) => s.lastOrderSyncAt).filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  const alerts: { level: "kritik" | "onemli" | "firsat" | "bilgi"; text: string; href: string }[] = [];
  if (stock.critical) alerts.push({ level: "kritik", text: `${stock.critical} ürün stokta kritik seviyede`, href: "/finans/stok" });
  const adCh = kpis.ads.change;
  if (adCh !== null && adCh >= 20) alerts.push({ level: "onemli", text: `Reklam harcaması önceki döneme göre %${Math.round(adCh)} arttı`, href: "/reklam" });
  if (L?.salesExpenses.state === "missing") alerts.push({ level: "onemli", text: "Satış gideri kaydı yok; katkı kârı hesaplanamıyor", href: "/analiz/giderler" });
  else if (L?.salesExpenses.state === "partial") alerts.push({ level: "onemli", text: `${m!.orders} siparişin ${m!.expenses.ordersWithExpense} tanesinde gider kaydı var`, href: "/analiz/giderler" });
  const best = productTabs.kazandiran[0];
  if (best && best.marj !== null && best.marj >= 40) alerts.push({ level: "firsat", text: `${best.ad} %${best.marj} brüt marjla en çok kazandıran ürün`, href: "/finans/urun" });
  if (a.ozet.maliyetiEksikUrun) alerts.push({ level: "bilgi", text: `${a.ozet.maliyetiEksikUrun} ürünün sipariş anındaki maliyeti eksik`, href: "/analiz/maliyetler" });
  if (m && m.operating.expenses === null && !channel) alerts.push({ level: "bilgi", text: "İşletme giderleri girilmedi; işletme kârı gösterilmiyor", href: "/analiz/isletme-giderleri" });

  // ── Özet değerlendirme
  const topChannel = channels.filter((c) => c.contribution !== null || c.net !== null).sort((x, y) => (y.contribution ?? y.net ?? 0) - (x.contribution ?? x.net ?? 0))[0] ?? null;
  const summary: string[] = [];
  if (kpis.revenue.change !== null) summary.push(`Seçili dönemde ciro önceki döneme göre %${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(kpis.revenue.change))} ${kpis.revenue.change >= 0 ? "arttı" : "azaldı"}.`);
  else if (m) summary.push("Önceki dönemde karşılaştırılacak satış yok.");
  if (kpis.margin.value !== null) summary.push(`${marginBasis === "katkı" ? "Katkı" : "Brüt"} kâr marjı %${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(kpis.margin.value)}${marginBasis === "brüt" ? " (satış giderleri ve reklam eksik olduğu için brüt marj)" : ""}.`);
  if (topChannel) summary.push(`En yüksek katkıyı sağlayan kanal ${topChannel.label}.`);
  if (L?.contribution.state === "partial" || L?.productCost.state !== "ok") summary.push("Bazı maliyet veya gider kayıtları eksik; kâr değerleri bu nedenle kesin değildir.");

  return {
    range, prevRange: prevR, currency, currencies, channel, storeId: run.stores.length === 1 && opt.storeId ? opt.storeId : null,
    stores: await db.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
    demo: run.stores.some((s) => s.clientId === "demo"), lastSync, hasData: !!m,
    kpis, series, parts, partsTotal, channels, productTabs, stock, stockRows, alerts, summary, prods,
    // Sipariş bazında finans (seçili para birimi; aynı motor, sipariş başına).
    orderRows: f.orders.filter((o) => o.currency === currency).map((o) => {
      const raw = run.orders.find((x) => x.id === o.id)!;
      const r = computeFinance([o], { expenses: f.opt.expenses.filter((e) => e.orderId === o.id) })[0];
      const L2 = r?.layers;
      return {
        id: o.id, number: raw.orderNumber, at: o.orderedAt, status: o.status, store: run.stores.find((st) => st.id === o.storeId)?.label ?? "",
        total: o.orderTotal, net: L2?.netSales.amount ?? 0, cost: L2?.productCost.amount ?? null, costState: L2?.productCost.state ?? "missing",
        expenses: L2?.salesExpenses.amount ?? null, refunded: r?.deductions.refunded ?? 0, cancelled: r?.deductions.cancelled ?? 0,
        contribution: L2 && L2.productCost.state === "ok" ? Math.round((L2.netSales.amount! - L2.productCost.amount! - (L2.salesExpenses.amount ?? 0)) * 100) / 100 : null,
        lines: o.lines.length, refundSource: o.refundPayments != null ? "ödeme" : r?.deductions.refunded ? "kalem durumu" : null,
      };
    }).sort((x, y) => y.at.getTime() - x.at.getTime()),
    layers: L ?? null, finance: m, analysis: a,
  };
}
export type FinanceDashboard = Awaited<ReturnType<typeof buildFinanceDashboard>>;
