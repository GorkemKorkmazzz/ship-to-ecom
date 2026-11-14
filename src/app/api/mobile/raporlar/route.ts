import { getReportData, getStores } from "@/lib/cache";
import { withUser } from "@/lib/mobile";
import { PAYMENT_STATUS } from "@/lib/status";

const RANGES = [7, 30, 90, 365];
const CAMPAIGN: Record<string, string> = { RATIO: "Yüzde indirimi", FIXED_AMOUNT: "Tutar indirimi", FREE_SHIPPING: "Ücretsiz kargo", BUY_X_THEN_GET_Y: "X al Y öde" };
const r2 = (n: number) => Math.round(n * 100) / 100;

type Row = { ad: string; adet: number; tutar: number };
function group<T>(items: T[], key: (x: T) => string | null | undefined, amount: (x: T) => number, empty = "Belirtilmemiş", limit = 10): Row[] {
  const m = new Map<string, Row>();
  for (const x of items) {
    const ad = key(x)?.trim() || empty;
    const r = m.get(ad) ?? { ad, adet: 0, tutar: 0 };
    r.adet++;
    r.tutar += amount(x);
    m.set(ad, r);
  }
  return [...m.values()].sort((a, b) => b.tutar - a.tutar || b.adet - a.adet).slice(0, limit).map((r) => ({ ...r, tutar: r2(r.tutar) }));
}

// GET ?gun=7|30|90|365&magaza=<id> → paneldeki Raporlar sayfasıyla aynı kırılımlar.
// İptal ve taslak siparişler hariçtir; müşteri bilgisi kullanılmaz.
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const stores = await getStores(user.id);
  const range = RANGES.includes(Number(sp.get("gun"))) ? Number(sp.get("gun")) : 30;
  const selected = stores.find((s) => s.id === sp.get("magaza"));
  const storeIds = selected ? [selected.id] : stores.map((s) => s.id);
  const { orders, carts } = storeIds.length ? await getReportData(user.id, storeIds, range) : { orders: [], carts: [] };

  const amt = (o: (typeof orders)[number]) => o.totalFinalPrice;
  const total = orders.reduce((a, o) => a + o.totalFinalPrice, 0);
  const storeLabel = (id: string) => stores.find((s) => s.id === id)?.label ?? "—";
  const used = orders.flatMap((o) => {
    try {
      return (JSON.parse(o.campaigns) as { name: string; type: string | null; amount: number }[]).map((c) => ({ ...c, order: o }));
    } catch {
      return [];
    }
  });
  const utm = orders.filter((o) => o.utmSource || o.utmMedium || o.utmCampaign);
  const recovered = carts.filter((c) => c.recoveryStatus === "RECOVERED" || c.status === "COMPLETED");

  return Response.json({
    gun: range,
    paraBirimi: orders[0]?.currency ?? "TRY",
    magazalar: stores.map((s) => ({ id: s.id, ad: s.label })),
    ozet: {
      ciro: r2(total),
      siparis: orders.length,
      ortalama: orders.length ? r2(total / orders.length) : 0,
      indirim: r2(used.reduce((a, c) => a + c.amount, 0)),
      terkEdilenSepet: carts.length - recovered.length,
    },
    // Kanal, kaynak ve il alanları dolu sipariş yoksa uygulama uyarı gösterir.
    raporAlaniVar: orders.some((o) => o.salesChannel || o.city || o.trafficSource),
    gruplar: [
      {
        baslik: "Siparişler nereden geliyor",
        bolumler: [
          { baslik: "Satış kanalı", birim: "sipariş", satirlar: group(orders, (o) => o.salesChannel, amt) },
          { baslik: "Trafik kaynağı", birim: "sipariş", satirlar: group(orders, (o) => o.trafficSource, amt) },
          { baslik: "Yönlendiren site", birim: "sipariş", satirlar: group(orders, (o) => o.referer, amt, "Doğrudan / bilinmiyor") },
          { baslik: "Mağaza", birim: "sipariş", satirlar: group(orders, (o) => storeLabel(o.storeId), amt) },
        ],
      },
      {
        baslik: "Reklam etiketleri (UTM)",
        bolumler: [
          { baslik: "Kaynak", birim: "sipariş", satirlar: group(utm, (o) => o.utmSource, amt) },
          { baslik: "Ortam", birim: "sipariş", satirlar: group(utm, (o) => o.utmMedium, amt) },
          { baslik: "Kampanya", birim: "sipariş", satirlar: group(utm, (o) => o.utmCampaign, amt) },
        ],
      },
      {
        baslik: "Kargo adresleri",
        bolumler: [
          { baslik: "İllere göre", birim: "sipariş", satirlar: group(orders, (o) => o.city, amt, "Belirtilmemiş", 15) },
          { baslik: "İlçelere göre", birim: "sipariş", satirlar: group(orders.filter((o) => o.district), (o) => `${o.district} / ${o.city ?? ""}`, amt, "Belirtilmemiş", 15) },
        ],
      },
      {
        baslik: "Kampanyalar ve indirimler",
        bolumler: [
          { baslik: "Kampanya türü", ipucu: "Tutar, verilen indirimi gösterir", birim: "kullanım", satirlar: group(used, (c) => (c.type ? CAMPAIGN[c.type] ?? c.type : "Diğer indirim"), (c) => c.amount) },
          { baslik: "Kampanya adı", ipucu: "Tutar, verilen indirimi gösterir", birim: "kullanım", satirlar: group(used, (c) => c.name, (c) => c.amount) },
          { baslik: "Kupon kodu", ipucu: "Tutar, kuponlu siparişlerin cirosu", birim: "sipariş", satirlar: group(orders.filter((o) => o.couponCode), (o) => o.couponCode, amt) },
        ],
      },
      {
        baslik: "Diğer",
        bolumler: [
          { baslik: "Ödeme durumu", birim: "sipariş", satirlar: group(orders, (o) => (o.paymentStatus ? PAYMENT_STATUS[o.paymentStatus]?.[0] ?? o.paymentStatus : null), amt) },
          { baslik: "En çok satan ürünler", birim: "satır", satirlar: group(orders.flatMap((o) => o.lines), (l) => l.name || l.sku, (l) => (l.finalPrice ?? 0) * l.quantity) },
          { baslik: "Terk edilmiş sepetler", ipucu: "Tutar, sepetlerin toplam değeri", birim: "sepet", satirlar: group(carts, (c) => (c.recoveryStatus === "RECOVERED" || c.status === "COMPLETED" ? "Kurtarılan" : "Kurtarılmayı bekleyen"), (c) => c.total) },
        ],
      },
    ],
  });
});
