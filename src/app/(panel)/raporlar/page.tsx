import Link from "next/link";
import { getReportData, getStores } from "@/lib/cache";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtMoney } from "../ui";

const RANGES = [7, 30, 90, 365];
const CAMPAIGN: Record<string, string> = { RATIO: "Yüzde indirimi", FIXED_AMOUNT: "Tutar indirimi", FREE_SHIPPING: "Ücretsiz kargo", BUY_X_THEN_GET_Y: "X al Y öde" };
const PAYMENT: Record<string, string> = { PAID: "Ödendi", WAITING: "Ödeme bekliyor", PARTIALLY_PAID: "Kısmi ödendi", FAILED: "Başarısız" };

type Row = { label: string; count: number; amount: number };
function group<T>(items: T[], key: (x: T) => string | null | undefined, amount: (x: T) => number, empty = "Belirtilmemiş"): Row[] {
  const m = new Map<string, Row>();
  for (const x of items) {
    const label = key(x)?.trim() || empty;
    const r = m.get(label) ?? { label, count: 0, amount: 0 };
    r.count++;
    r.amount += amount(x);
    m.set(label, r);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function Breakdown({ title, hint, rows, unit, money, limit = 10 }: { title: string; hint?: string; rows: Row[]; unit: string; money: (n: number) => string; limit?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <section className="card">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-4 space-y-3">
        {rows.slice(0, limit).map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{r.label}</span>
              <span className="shrink-0 tabular-nums text-gray-600">
                {r.count} {unit} · <span className="font-semibold text-gray-900">{money(r.amount)}</span>
                <span className="ml-1 text-xs text-gray-400">%{total ? Math.round((r.amount / total) * 100) : 0}</span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${Math.max(2, (r.amount / max) * 100)}%` }} /></div>
          </div>
        ))}
        {rows.length > limit && <p className="text-xs text-gray-500">+{rows.length - limit} satır daha</p>}
        {!rows.length && <p className="py-4 text-center text-sm text-gray-500">Bu dönemde veri yok.</p>}
      </div>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ gun?: string; magaza?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);
  const range = RANGES.includes(Number(sp.gun)) ? Number(sp.gun) : 30;
  const selected = stores.find((s) => s.id === sp.magaza);
  const storeIds = selected ? [selected.id] : stores.map((s) => s.id);
  const { orders, carts } = await getReportData(user.id, storeIds, range);
  const currency = orders[0]?.currency ?? "TRY";
  const money = (n: number) => fmtMoney(n, currency);
  const total = orders.reduce((a, o) => a + o.totalFinalPrice, 0);
  const amt = (o: (typeof orders)[number]) => o.totalFinalPrice;
  const storeLabel = (id: string) => stores.find((s) => s.id === id)?.label ?? "—";

  const used = orders.flatMap((o) => (JSON.parse(o.campaigns) as { name: string; type: string | null; amount: number }[]).map((c) => ({ ...c, order: o })));
  const utm = orders.filter((o) => o.utmSource || o.utmMedium || o.utmCampaign);
  const withReport = orders.filter((o) => o.salesChannel || o.city || o.trafficSource).length;
  const recoveredCarts = carts.filter((c) => c.recoveryStatus === "RECOVERED" || c.status === "COMPLETED");
  const discountTotal = used.reduce((a, c) => a + c.amount, 0);

  const link = (patch: { gun?: number; magaza?: string | null }) => {
    const p = new URLSearchParams();
    const gun = patch.gun ?? range;
    const magaza = patch.magaza === undefined ? selected?.id : patch.magaza;
    if (gun !== 30) p.set("gun", String(gun));
    if (magaza) p.set("magaza", magaza);
    const s = p.toString();
    return s ? `/raporlar?${s}` : "/raporlar";
  };
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  const kpis = [
    ["Ciro", money(total)],
    ["Sipariş", String(orders.length)],
    ["Ort. sepet", money(orders.length ? total / orders.length : 0)],
    ["Kampanya indirimi", money(discountTotal)],
    ["Terk edilen sepet", `${carts.length - recoveredCarts.length}`],
  ];

  return (
    <>
      <PageHeader title="Raporlar" desc="İptal ve taslak siparişler hariç · müşteri bilgileri kullanılmaz" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ magaza: null })} className={pill(!selected)}>Tüm mağazalar</Link>
          {stores.map((s) => <Link key={s.id} href={link({ magaza: s.id })} className={pill(selected?.id === s.id)}>{s.label}</Link>)}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          {RANGES.map((r) => <Link key={r} href={link({ gun: r })} className={pill(range === r)}>{r === 365 ? "Son 1 yıl" : `Son ${r} gün`}</Link>)}
        </div>
      </div>

      {orders.length > 0 && withReport === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Bu dönemdeki siparişlerde kanal, kaynak ve il bilgisi yok. Bu alanlar yeni senkronla gelir; eski siparişler ikas&apos;ta güncellendikçe dolar.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-gray-400">Siparişler nereden geliyor</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="Satış kanalı" hint="Siparişin oluştuğu ikas satış kanalı" rows={group(orders, (o) => o.salesChannel, amt)} unit="sipariş" money={money} />
        <Breakdown title="Trafik kaynağı" hint="Ziyaretin geldiği kaynak (doğrudan, arama, sosyal medya…)" rows={group(orders, (o) => o.trafficSource, amt)} unit="sipariş" money={money} />
        <Breakdown title="Yönlendiren site" hint="Müşteriyi mağazaya getiren alan adı" rows={group(orders, (o) => o.referer, amt, "Doğrudan / bilinmiyor")} unit="sipariş" money={money} />
        <Breakdown title="Mağaza" rows={group(orders, (o) => storeLabel(o.storeId), amt)} unit="sipariş" money={money} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-gray-400">Reklam ve kampanya etiketleri (UTM)</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        <Breakdown title="Kaynak (utm_source)" rows={group(utm, (o) => o.utmSource, amt)} unit="sipariş" money={money} />
        <Breakdown title="Ortam (utm_medium)" rows={group(utm, (o) => o.utmMedium, amt)} unit="sipariş" money={money} />
        <Breakdown title="Kampanya (utm_campaign)" rows={group(utm, (o) => o.utmCampaign, amt)} unit="sipariş" money={money} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-gray-400">Kargo adresleri</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Breakdown title="İllere göre" rows={group(orders, (o) => o.city, amt)} unit="sipariş" money={money} limit={15} />
        <Breakdown title="İlçelere göre" rows={group(orders.filter((o) => o.district), (o) => `${o.district} / ${o.city ?? ""}`, amt)} unit="sipariş" money={money} limit={15} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-gray-400">Kampanyalar ve indirimler</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        <Breakdown title="Kampanya türü" hint="Tutar, verilen indirimi gösterir" rows={group(used, (c) => (c.type ? CAMPAIGN[c.type] ?? c.type : "Diğer indirim"), (c) => c.amount)} unit="kullanım" money={money} />
        <Breakdown title="Kampanya adı" hint="Tutar, verilen indirimi gösterir" rows={group(used, (c) => c.name, (c) => c.amount)} unit="kullanım" money={money} />
        <Breakdown title="Kupon kodu" hint="Tutar, kuponlu siparişlerin cirosu" rows={group(orders.filter((o) => o.couponCode), (o) => o.couponCode, amt)} unit="sipariş" money={money} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-widest text-gray-400">Diğer</h2>
      <div className="grid gap-5 lg:grid-cols-3">
        <Breakdown title="Ödeme durumu" rows={group(orders, (o) => (o.paymentStatus ? PAYMENT[o.paymentStatus] ?? o.paymentStatus : null), amt)} unit="sipariş" money={money} />
        <Breakdown
          title="En çok satan ürünler"
          rows={group(orders.flatMap((o) => o.lines), (l) => l.name || l.sku, (l) => (l.finalPrice ?? 0) * l.quantity)}
          unit="satır" money={money}
        />
        <Breakdown
          title="Terk edilmiş sepetler"
          hint="Tutar, sepetlerin toplam değeri"
          rows={group(carts, (c) => (c.recoveryStatus === "RECOVERED" || c.status === "COMPLETED" ? "Kurtarılan" : "Kurtarılmayı bekleyen"), (c) => c.total)}
          unit="sepet" money={money}
        />
      </div>
    </>
  );
}
