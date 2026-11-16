// Merkezi finans hesaplama motoru. Saf işlev: veritabanı ya da ağ kullanmaz; aynı girdi aynı çıktıyı verir.
// Kurallar:
//  - Tutarlar kuruş (en küçük birim) cinsinden tam sayıyla toplanır; yuvarlama yalnızca kalem tutarı hesaplanırken bir kez yapılır.
//  - Para birimleri asla birbirine eklenmez: her para birimi ayrı hesaplanır.
//  - Veri yoksa katman null'dır (0 değil) ve nedeni yazılır; kısmi veride katman "eksik" işaretlenir.
//  - İptal edilen kalem net satışa girmez; iade edilen kalem net satıştan düşülür. Taslak sipariş hiç sayılmaz.
// Kaynaktan bağımsızdır: her satış kanalı kendi verisini FinanceOrder biçimine dönüştürür (src/lib/finance/sources).

export type LineState = "active" | "cancelled" | "refunded";
export type FinanceLine = {
  key: string; // ürün anahtarı (ortak stok SKU'su)
  sku: string; name: string;
  quantity: number;
  unitPrice: number | null; // kalemin birim satış fiyatı (kaynağın verdiği; indirim sonrası)
  state: LineState;
  unitCost: number | null; // birim ürün maliyeti; bilinmiyorsa null
  costSource: string | null; // ör. "snapshot:IKAS_BUY_PRICE" | "history:MANUAL"
  /** Kesin maliyet yoksa yalnızca TAHMİN için kullanılacak maliyet (ör. güncel alış fiyatı). Kesin katmanlara girmez. */
  estimateCost?: number | null;
  listPrice?: number | null; // indirim öncesi birim fiyat (biliniyorsa)
  taxAmount?: number | null; // kalemin vergi tutarı (biliniyorsa)
  weight?: number | null; // birim ağırlık (ağırlığa göre gider dağıtımı için; yoksa o yöntem uygulanamaz)
};
export type FinanceOrder = {
  id: string; storeId: string; source: string; currency: string;
  status: string; // kaynak durumu (bilgi için)
  draft: boolean; cancelled: boolean; // siparişin tamamı
  orderTotal: number | null; // kaynağın sipariş toplamı (kargo vb. dahil olabilir; bilgi için)
  orderedAt: Date;
  lines: FinanceLine[];
  /** Kaynağın kalem net toplamı (ikas totalPrice) ve müşteriden alınan kargo ücreti; ikisi de biliniyorsa sipariş düzeyi düzeltme türetilir. */
  linesNetTotal?: number | null;
  shippingIncome?: number | null;
  shippingTax?: number | null;
  /** Bu sipariş için kayıtlı iade ödemeleri toplamı (sipariş para biriminde). Varsa kalem durumundan türetilen iade yerine kullanılır. */
  refundPayments?: number | null;
};
/** Siparişe bağlı ya da dönemsel satış giderleri (finansal kayıtlardan), para birimi başına. */
export type AllocationMethod = "REVENUE" | "QUANTITY" | "WEIGHT" | "MANUAL";
export type ExpenseInput = {
  currency: string; type: string; amount: number; taxAmount: number | null; orderId: string | null;
  method?: AllocationMethod | null; // null = REVENUE (satış tutarına göre)
  manual?: { sku: string; amount: number }[]; // MANUAL: SKU başına tutar; kalan dağıtılamayan sayılır
};
/** Reklam gideri: key = ürün anahtarı (platformun ürün kırılımıyla kesin eşleşen); null = hiçbir ürünle ilişkilendirilemeyen. */
export type AdInput = { currency: string; key: string | null; amount: number };

/**
 * Dönemsel gider payı: [periodStart, periodEnd] ile rapor aralığının kesişen gün oranı. Sınırlar gün başı / gün sonu olduğundan
 * aralık son günü zaten kapsar. Örn. 1–30 Kasım kirasının 1–15 Kasım payı 15/30.
 */
export function prorate(amount: number, periodStart: Date, periodEnd: Date, rangeStart: Date, rangeEnd: Date) {
  const DAY = 86400000;
  const total = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY));
  const overlap = Math.max(0, Math.round((Math.min(periodEnd.getTime(), rangeEnd.getTime()) - Math.max(periodStart.getTime(), rangeStart.getTime())) / DAY));
  return Math.round(amount * Math.min(1, overlap / total) * 100) / 100;
}

/** Tutarı (kuruş) ağırlıklara orantılı böler; en büyük kalan yöntemiyle toplam birebir korunur. Ağırlık toplamı 0 ise null. */
export function splitCents(total: number, weights: number[]): number[] | null {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || weights.some((w) => w < 0)) return null;
  const raw = weights.map((w) => (total * w) / sum), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[1])) { if (left <= 0) break; out[i]++; left--; }
  return out;
}

export type Layer = { amount: number | null; state: "ok" | "partial" | "missing"; note: string; sources: string[] };
const c = (x: number) => Math.round(x * 100); // kuruşa
const u = (cents: number) => cents / 100;
const lineCents = (l: FinanceLine) => (l.unitPrice === null ? null : c(l.unitPrice * l.quantity));

export type ProductFinance = {
  key: string; sku: string; name: string; currency: string;
  soldQty: number; cancelledQty: number; refundedQty: number;
  grossSales: number; netSales: number; cost: number | null; grossProfit: number | null; margin: number | null;
  costMissing: boolean; costSources: string[];
  allocatedExpenses: number; adSpend: number;
  /** Ürün katkı kârı = brüt kâr − ürüne dağıtılan satış giderleri − ürünle ilişkilendirilen reklam gideri. Maliyet eksikse null. */
  contribution: number | null;
};

export type CurrencyFinance = {
  currency: string; orders: number; orderTotal: number;
  grossQty: number; netQty: number;
  layers: {
    grossSales: Layer; netSales: Layer; productCost: Layer; grossProfit: Layer;
    salesExpenses: Layer; contribution: Layer; operatingProfit: Layer;
  };
  deductions: { cancelled: number; refunded: number; missingPrice: number };
  discounts: { product: number | null; order: number | null; orderNote: string };
  shipping: { income: number; ordersWithData: number };
  tax: { lines: number; shipping: number; expenses: number; linesKnown: number; linesTotal: number; note: string };
  expenses: { byType: Record<string, number>; ordersWithExpense: number; unlinked: number };
  refundSource: { payments: number; lineStatus: number };
  allocation: { allocated: number; unallocated: number; byMethod: Record<string, number>; unallocatedReasons: Record<string, number> };
  ads: { known: boolean; attributed: number; attributedNoSales: number; unattributed: number };
  operating: { expenses: number | null };
  /** Tahmin: maliyeti eksik kalemlere güncel maliyet uygulanırsa brüt kâr. Kesin sonuç değildir; ayrı gösterilir. */
  estimate: { grossProfit: number | null; estimatedLines: number; basis: string };
  costCoverage: { costedNetSales: number; uncostedNetSales: number; uncostedLines: number };
  products: ProductFinance[];
};

/** Siparişleri para birimine göre ayrı ayrı katmanlara ayırır. */
export function computeFinance(orders: FinanceOrder[], opt: { salesExpenses?: Map<string, number> | null; operatingExpenses?: Map<string, number> | null; expenses?: ExpenseInput[]; ads?: AdInput[] | null } = {}) {
  const byCur = new Map<string, FinanceOrder[]>();
  for (const o of orders) if (!o.draft) byCur.set(o.currency, [...(byCur.get(o.currency) ?? []), o]);

  const result: CurrencyFinance[] = [];
  for (const [currency, list] of byCur) {
    let gross = 0, cancelled = 0, refunded = 0, missingPrice = 0, cost = 0, costedNet = 0, uncostedNet = 0, uncostedLines = 0, total = 0, grossQty = 0, netQty = 0;
    let anyNet = false, sold = 0, estCost = 0, estLines = 0, estOk = true;
    let listGross = 0, listKnown = true, orderAdj = 0, orderAdjKnown = 0, shipIncome = 0, shipTax = 0, shipOrders = 0, lineTax = 0, taxKnown = 0, linesAll = 0, payRefund = 0, payOrders = 0, statusRefundOrders = 0;
    const prod = new Map<string, ProductFinance & { _cost: number; _costedNet: number; _alloc: number; _ad: number }>();
    const netLines = new Map<string, { key: string; sku: string; amt: number; qty: number; weight: number | null }[]>(); // sipariş → satılan kalemler
    for (const o of list) {
      if (!o.cancelled) { sold++; if (o.orderTotal !== null) total += c(o.orderTotal); }
      // İade ödemesi kaydı varsa bu siparişin iadesi ödemeden alınır (kalem durumu kullanılmaz: aynı iade iki kez düşülmez).
      const usePayments = !o.cancelled && o.refundPayments != null;
      if (usePayments) { payRefund += c(o.refundPayments!); payOrders++; }
      if (!o.cancelled && o.shippingIncome != null) {
        shipIncome += c(o.shippingIncome); shipTax += c(o.shippingTax ?? 0); shipOrders++;
        // Sipariş düzeyi düzeltme (indirim/ek ücret): toplam − kalem net toplamı − kargo (ikas tanımı; hediye paketi varsa içerir).
        if (o.linesNetTotal != null && o.orderTotal !== null) { orderAdj += c(o.orderTotal) - c(o.linesNetTotal) - c(o.shippingIncome); orderAdjKnown++; }
      }
      for (const l of o.lines) {
        const amt = lineCents(l);
        const state: LineState = o.cancelled ? "cancelled" : l.state;
        const p = prod.get(l.key) ?? prod.set(l.key, { key: l.key, sku: l.sku, name: l.name, currency, soldQty: 0, cancelledQty: 0, refundedQty: 0, grossSales: 0, netSales: 0, cost: null, grossProfit: null, margin: null, costMissing: false, costSources: [], allocatedExpenses: 0, adSpend: 0, contribution: null, _cost: 0, _costedNet: 0, _alloc: 0, _ad: 0 }).get(l.key)!;
        grossQty += l.quantity;
        if (amt === null) { missingPrice += l.quantity; continue; }
        gross += amt; p.grossSales += amt;
        linesAll++;
        if (l.listPrice != null) listGross += c(l.listPrice * l.quantity); else listKnown = false;
        if (state === "cancelled") { cancelled += amt; p.cancelledQty += l.quantity; continue; }
        if (state === "refunded" && !usePayments) { refunded += amt; p.refundedQty += l.quantity; statusRefundOrders++; continue; }
        if (state === "refunded") { p.refundedQty += l.quantity; continue; } // tutar iade ödemesinden düşülür
        if (l.taxAmount != null) { lineTax += c(l.taxAmount); taxKnown++; }
        anyNet = true; netQty += l.quantity; p.soldQty += l.quantity; p.netSales += amt;
        netLines.set(o.id, [...(netLines.get(o.id) ?? []), { key: l.key, sku: l.sku, amt, qty: l.quantity, weight: l.weight ?? null }]);
        if (l.unitCost === null) {
          uncostedNet += amt; uncostedLines++; p.costMissing = true;
          if (l.estimateCost != null) { estCost += c(l.estimateCost * l.quantity); estLines++; } else estOk = false;
          continue;
        }
        const lc = c(l.unitCost * l.quantity);
        estCost += lc;
        cost += lc; costedNet += amt; p._cost += lc; p._costedNet += amt;
        if (l.costSource && !p.costSources.includes(l.costSource)) p.costSources.push(l.costSource);
      }
    }
    refunded += payRefund;
    const net = gross - cancelled - refunded;
    // Satış giderleri: finansal kayıtlar (DEBIT). Kayıt yoksa "veri yok"; bazı siparişlerde varsa "eksik olabilir".
    const exp = (opt.expenses ?? []).filter((e) => e.currency === currency);
    const byType: Record<string, number> = {};
    let expTotal = 0, expTax = 0;
    for (const e of exp) { byType[e.type] = (byType[e.type] ?? 0) + c(e.amount); expTotal += c(e.amount); expTax += c(e.taxAmount ?? 0); }
    const ordersWithExp = new Set(exp.map((e) => e.orderId).filter(Boolean)).size;
    // Gider dağıtımı: sipariş gideri o siparişin satılan kalemlerine yönteme göre bölünür. Dağıtılamayan tutar kaybolmaz, nedeniyle ayrı tutulur.
    let allocated = 0;
    const byMethod: Record<string, number> = {}, reasons: Record<string, number> = {};
    const miss = (why: string, cents: number) => { if (cents > 0) reasons[why] = (reasons[why] ?? 0) + cents; };
    for (const e of exp) {
      const cents = c(e.amount), method = e.method ?? "REVENUE";
      const lines = e.orderId ? netLines.get(e.orderId) : undefined;
      if (!e.orderId) { miss("Siparişe bağlı değil", cents); continue; }
      if (!lines?.length) { miss("Siparişte satılan kalem yok (iptal/iade ya da dönem dışı)", cents); continue; }
      let parts: number[] | null = null, rest = 0;
      if (method === "MANUAL") {
        const want = lines.map((l) => c((e.manual ?? []).filter((m) => m.sku === l.sku).reduce((a, m) => a + m.amount, 0)));
        // Aynı SKU birden çok kalemdeyse elle tutar ilk kaleme yazılır.
        const seen = new Set<string>();
        parts = lines.map((l, i) => (seen.has(l.sku) ? 0 : (seen.add(l.sku), want[i])));
        const sum = parts.reduce((a, b) => a + b, 0);
        if (sum > cents) { parts = splitCents(cents, parts); rest = 0; } else rest = cents - sum;
        if (rest) miss("Elle dağıtımda ürüne yazılmayan kalan", rest);
      } else {
        const w = lines.map((l) => (method === "QUANTITY" ? l.qty : method === "WEIGHT" ? (l.weight == null ? -1 : l.weight * l.qty) : Math.max(0, l.amt)));
        parts = splitCents(cents, w);
        if (!parts) { miss(method === "WEIGHT" ? "Ağırlık bilgisi yok" : method === "QUANTITY" ? "Adet toplamı sıfır" : "Kalem satış tutarı sıfır", cents); continue; }
      }
      if (!parts) { miss("Dağıtılamadı", cents); continue; }
      parts.forEach((v, i) => { prod.get(lines[i].key)!._alloc += v; });
      const done = parts.reduce((a, b) => a + b, 0);
      allocated += done; byMethod[method] = (byMethod[method] ?? 0) + done;
    }
    // Reklam: yalnızca platformun ürün kırılımıyla kesin eşleşen harcama ürüne yazılır; kalanı ayrı tutulur (tahmini dağıtım yok).
    const ads = opt.ads == null ? null : opt.ads.filter((a) => a.currency === currency);
    let adAttr = 0, adUn = 0, adNoSales = 0;
    for (const a of ads ?? []) {
      const p = a.key ? prod.get(a.key) : undefined;
      if (p) { p._ad += c(a.amount); adAttr += c(a.amount); }
      else if (a.key) { adAttr += c(a.amount); adNoSales += c(a.amount); } // ürünle eşleşti ama dönemde satışı yok: yine ürün reklamıdır
      else adUn += c(a.amount);
    }
    const costState: Layer["state"] = !anyNet ? "missing" : uncostedLines === 0 ? "ok" : costedNet === 0 ? "missing" : "partial";
    const gp = costedNet - cost; // yalnızca maliyeti bilinen kalemler
    const se = opt.salesExpenses?.get(currency) ?? (exp.length ? u(expTotal) : null), oe = opt.operatingExpenses?.get(currency) ?? null;
    const seState: Layer["state"] = se === null ? "missing" : exp.length && ordersWithExp < sold ? "partial" : "ok";
    const contribution = costState === "ok" && se !== null ? gp - c(se) - adAttr : null;
    result.push({
      currency, orders: sold, orderTotal: u(total), grossQty, netQty,
      deductions: { cancelled: u(cancelled), refunded: u(refunded), missingPrice },
      discounts: {
        product: listKnown && linesAll ? u(listGross - gross) : null,
        order: orderAdjKnown ? u(-orderAdj) : null,
        orderNote: orderAdjKnown ? `ikas totalFinalPrice − totalPrice − kargo üzerinden ${orderAdjKnown} siparişte türetildi (pozitif = indirim; hediye paketi ücreti varsa içerir).` : "Sipariş düzeyi indirim verisi yok.",
      },
      shipping: { income: u(shipIncome), ordersWithData: shipOrders },
      tax: { lines: u(lineTax), shipping: u(shipTax), expenses: u(expTax), linesKnown: taxKnown, linesTotal: linesAll,
        note: "ikas belgesi fiyatların KDV dahil olup olmadığını belirtmiyor; KDV tutarları ayrı gösterilir, satıştan düşülmez ya da eklenmez." },
      expenses: { byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, u(v)])), ordersWithExpense: ordersWithExp, unlinked: exp.filter((e) => !e.orderId).length },
      refundSource: { payments: payOrders, lineStatus: statusRefundOrders },
      allocation: { allocated: u(allocated), unallocated: u(expTotal - allocated), byMethod: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k, u(v)])), unallocatedReasons: Object.fromEntries(Object.entries(reasons).map(([k, v]) => [k, u(v)])) },
      ads: { known: ads !== null, attributed: u(adAttr), attributedNoSales: u(adNoSales), unattributed: u(adUn) },
      operating: { expenses: oe },
      estimate: { grossProfit: anyNet && estOk && estLines > 0 ? u(net - estCost) : null, estimatedLines: estLines, basis: "Maliyeti bilinmeyen kalemlere güncel alış fiyatı uygulanarak (tahmin)." },
      costCoverage: { costedNetSales: u(costedNet), uncostedNetSales: u(uncostedNet), uncostedLines },
      layers: {
        grossSales: { amount: u(gross), state: missingPrice ? "partial" : "ok", note: `Kalem satış fiyatı × adet (ürün indirimi sonrası, iptal/iade öncesi).${missingPrice ? ` Fiyatı olmayan ${missingPrice} adet dahil değil.` : ""}`, sources: ["sipariş kalemleri"] },
        netSales: { amount: u(net), state: missingPrice ? "partial" : "ok", note: `Brüt satış − iptal edilen kalemler − iadeler.${payOrders ? ` ${payOrders} siparişte iade tutarı gerçek iade ödemesinden alındı (kargo iadesi içerebilir).` : ""} Sipariş düzeyi indirim ayrıca gösterilir, düşülmez.`, sources: ["sipariş kalemleri", "kalem durumu", "iade ödemeleri"] },
        productCost: { amount: costState === "missing" ? null : u(cost), state: costState, note: costState === "ok" ? "Tüm satılan kalemlerin maliyeti biliniyor." : costState === "partial" ? `${uncostedLines} kalemin maliyeti eksik; tutar yalnızca maliyeti bilinen kalemleri kapsar.` : "Maliyet bilgisi yok.", sources: ["sipariş anındaki maliyet (snapshot)", "maliyet geçmişi"] },
        grossProfit: { amount: costState === "missing" ? null : u(gp), state: costState, note: costState === "partial" ? `Yalnızca maliyeti bilinen ${new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(u(costedNet))} net satış üzerinden; maliyeti eksik satış kâra katılmadı.` : "Net satış − ürün maliyeti.", sources: ["net satış", "ürün maliyeti"] },
        salesExpenses: se === null
          ? { amount: null, state: "missing", note: "Komisyon, ödeme kesintisi ve kargo gideri kaydı yok (ikas bu giderleri sağlamaz; elle ya da pazaryeri aktarımıyla girilir).", sources: [] }
          : { amount: se, state: seState, note: seState === "partial" ? `Yalnızca kayıtlı giderler: ${sold} siparişin ${ordersWithExp} tanesinde gider kaydı var; diğerlerinde gider eksik olabilir.` : "Kayıtlı sipariş giderleri.", sources: ["finansal kayıtlar"] },
        contribution: contribution === null
          ? { amount: null, state: "missing", note: costState !== "ok" ? "Ürün maliyeti eksik olduğu için hesaplanamaz." : "Satış giderleri bilinmediği için hesaplanamaz.", sources: [] }
          : { amount: u(contribution), state: seState, note: seState === "partial" ? `Brüt kâr − kayıtlı satış giderleri − ürünle ilişkilendirilen reklam gideri. Gideri kaydedilmemiş siparişler nedeniyle olduğundan yüksek olabilir.${ads === null ? " Reklam gideri verisi yok." : ""}` : `Brüt kâr − satış giderleri − ürünle ilişkilendirilen reklam gideri.${ads === null ? " Reklam gideri verisi yok." : ""}`, sources: ["brüt kâr", "satış giderleri"] },
        operatingProfit: contribution === null || oe === null || seState !== "ok"
          ? { amount: null, state: "missing", note: oe === null ? "İşletme giderleri girilmediği için gösterilmez (0 kabul edilmez)." : "Katkı kârı kesin hesaplanamadığı (maliyet ya da satış gideri eksik) için gösterilmez.", sources: [] }
          : { amount: u(contribution - adUn - c(oe)), state: "ok", note: "Katkı kârı − ilişkilendirilemeyen reklam gideri − işletme giderleri (döneme gün bazında paylaştırılmış).", sources: ["katkı kârı", "reklam harcaması", "işletme giderleri"] },
      },
      products: [...prod.values()].map(({ _cost, _costedNet, _alloc, _ad, ...p }) => {
        const hasCost = p.soldQty > 0 && !p.costMissing;
        const gpP = hasCost ? _costedNet - _cost : null;
        return { ...p, allocatedExpenses: u(_alloc), adSpend: u(_ad), contribution: gpP === null ? null : u(gpP - _alloc - _ad), grossSales: u(p.grossSales), netSales: u(p.netSales), cost: hasCost ? u(_cost) : null, grossProfit: gpP === null ? null : u(gpP), margin: gpP !== null && p.netSales > 0 ? Math.round((gpP / p.netSales) * 1000) / 10 : null };
      }),
    });
  }
  // Ana para birimi: net satışı en yüksek olan (eşitlikte alfabetik); diğerleri ayrı listelenir, toplanmaz.
  result.sort((a, b) => (b.layers.netSales.amount ?? 0) - (a.layers.netSales.amount ?? 0) || a.currency.localeCompare(b.currency));
  return result;
}
export type FinanceResult = ReturnType<typeof computeFinance>;
