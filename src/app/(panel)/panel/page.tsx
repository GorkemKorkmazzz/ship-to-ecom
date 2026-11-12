import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { SalesChart } from "../chart";
import { Flash, STORE_HEX, StoreBadge, SyncButton, daysAgo, fmtDate, fmtMoney } from "../ui";

const RANGES = [7, 30, 90];
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const dayLabel = (d: Date, long: boolean) =>
  new Intl.DateTimeFormat("tr-TR", long ? { day: "numeric", month: "short", timeZone: "Europe/Istanbul" } : { weekday: "short", timeZone: "Europe/Istanbul" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; gun?: string; magaza?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });

  if (!stores.length) {
    return (
      <div className="card mx-auto mt-10 max-w-lg text-center">
        <h1 className="text-lg font-semibold">Hoş geldiniz</h1>
        <p className="mt-2 text-sm text-gray-600">Başlamak için iki ikas mağazanızı bağlayın. Aynı SKU&apos;ya sahip ürünler otomatik eşleşir ve tek stoktan düşer.</p>
        <Link href="/magazalar" className="btn mt-4">Mağaza bağla</Link>
      </div>
    );
  }

  const range = RANGES.includes(Number(sp.gun)) ? Number(sp.gun) : 7;
  const selected = stores.find((s) => s.id === sp.magaza);
  const shown = selected ? [selected] : stores;
  const since = daysAgo(range - 1);
  since.setHours(0, 0, 0, 0);

  const [orders, sharedCount, outOfStock, variantCount] = await Promise.all([
    db.order.findMany({ where: { storeId: { in: shown.map((s) => s.id) }, orderedAt: { gte: since } }, include: { lines: true } }),
    db.sharedItem.count({ where: { userId: user.id } }),
    db.sharedItem.count({ where: { userId: user.id, sharedStock: { lte: 0 } } }),
    db.storeVariant.groupBy({ by: ["matchSku"], where: { storeId: { in: stores.map((s) => s.id) } } }).then((r) => r.length),
  ]);

  const [sharedItems, skuSettings] = await Promise.all([
    db.sharedItem.findMany({ where: { userId: user.id }, select: { sku: true, sharedStock: true } }),
    db.skuSetting.findMany({ where: { userId: user.id }, select: { sku: true, lowStockThreshold: true } }),
  ]);
  const thresholds = new Map(skuSettings.map((x) => [x.sku, x.lowStockThreshold]));
  const lowStock = sharedItems.filter((x) => {
    const t = thresholds.get(x.sku) ?? user.lowStockThreshold;
    return t !== null && x.sharedStock <= t;
  }).length;

  const currency = orders[0]?.currency ?? "TRY";
  const money = (n: number) => fmtMoney(n, currency);
  const total = orders.reduce((a, o) => a + o.totalFinalPrice, 0);
  const units = orders.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.quantity, 0), 0);

  const dates = Array.from({ length: range }, (_, i) => daysAgo(range - 1 - i));
  const keys = dates.map(dayKey);
  const series = shown.map((s) => {
    const values = keys.map(() => 0);
    for (const o of orders) {
      if (o.storeId !== s.id || !o.orderedAt) continue;
      const i = keys.indexOf(dayKey(o.orderedAt));
      if (i >= 0) values[i] += o.totalFinalPrice;
    }
    return { label: s.label, color: STORE_HEX[stores.indexOf(s) % 2], values };
  });

  const bySku = new Map<string, { sku: string; name: string; qty: number; revenue: number }>();
  for (const o of orders)
    for (const l of o.lines) {
      const r = bySku.get(l.sku) ?? { sku: l.sku, name: l.name, qty: 0, revenue: 0 };
      r.qty += l.quantity;
      r.revenue += (l.finalPrice ?? 0) * l.quantity;
      bySku.set(l.sku, r);
    }
  const topSellers = [...bySku.values()].sort((a, b) => b.qty - a.qty).slice(0, 6);

  const link = (patch: { gun?: number; magaza?: string | null }) => {
    const p = new URLSearchParams();
    const gun = patch.gun ?? range;
    const magaza = patch.magaza === undefined ? selected?.id : patch.magaza;
    if (gun !== 7) p.set("gun", String(gun));
    if (magaza) p.set("magaza", magaza);
    const s = p.toString();
    return s ? `/panel?${s}` : "/panel";
  };
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;

  const stats = [
    { label: "Toplam satış", value: money(total) },
    { label: "Sipariş sayısı", value: String(orders.length) },
    { label: "Satılan adet", value: String(units) },
    { label: "Ort. sipariş tutarı", value: money(orders.length ? total / orders.length : 0) },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ magaza: null })} className={pill(!selected)}>Tüm mağazalar</Link>
          {stores.map((s) => (
            <Link key={s.id} href={link({ magaza: s.id })} className={pill(selected?.id === s.id)}>{s.label}</Link>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {RANGES.map((r) => (
            <Link key={r} href={link({ gun: r })} className={pill(range === r)}>Son {r} gün</Link>
          ))}
        </div>
        <span className="text-sm text-gray-500">Son senkron: {fmtDate(user.lastSyncAt)}</span>
        <div className="ml-auto"><SyncButton path="/panel" /></div>
      </div>
      <Flash ok={sp.ok} hata={sp.hata} />
      {stores.length < 2 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Ortak stok için ikinci mağazayı da bağlayın. <Link className="underline" href="/magazalar">Mağazalar</Link>
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <dl className="grid grid-cols-2 divide-gray-200 border-b border-gray-200 lg:grid-cols-4 lg:divide-x">
          {stats.map((s, i) => (
            <div key={s.label} className={`px-6 py-5 ${i === 0 ? "border-b-2 border-indigo-600" : ""}`}>
              <dt className="text-sm text-gray-500">{s.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{s.value}</dd>
            </div>
          ))}
        </dl>
        <div className="px-4 pb-2 pt-5">
          <div className="mb-2 flex flex-wrap gap-4 px-2 text-sm text-gray-600">
            {series.map((s) => (
              <span key={s.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
          <SalesChart days={dates.map((d) => dayLabel(d, range > 7))} series={series} fmt={(n) => money(n).replace(/,00$/, "")} />
        </div>
        <div className="grid gap-4 border-t border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
          {shown.map((s) => {
            const mine = orders.filter((o) => o.storeId === s.id);
            const sum = mine.reduce((a, o) => a + o.totalFinalPrice, 0);
            return (
              <Link key={s.id} href={`/siparisler?magaza=${s.id}`} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300">
                <div className="flex items-center justify-between">
                  <StoreBadge label={s.label} index={stores.indexOf(s)} />
                  <span className="badge bg-gray-100 text-gray-600">%{total ? Math.round((sum / total) * 100) : 0}</span>
                </div>
                <div className="mt-2 text-xl font-semibold tabular-nums">{money(sum)}</div>
                <div className="text-xs text-gray-500">{mine.length} sipariş · {s.storeName}.myikas.com</div>
                {s.lastError && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{s.lastError}</p>}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="font-semibold">En çok satanlar</h2>
          <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {topSellers.map((t) => (
              <div key={t.sku} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name || "—"}</div>
                  <div className="font-mono text-xs text-gray-400">{t.sku}</div>
                </div>
                <div className="tabular-nums text-gray-600">{t.qty} adet</div>
                <div className="w-28 text-right font-medium tabular-nums">{money(t.revenue)}</div>
              </div>
            ))}
            {!topSellers.length && <p className="py-8 text-center text-sm text-gray-500">Bu dönemde satış yok.</p>}
          </div>
        </section>

        <section className="card">
          <h2 className="font-semibold">Stok durumu</h2>
          <dl className="mt-3 divide-y divide-gray-100 border-t border-gray-100 text-sm">
            <div className="flex items-center justify-between py-3">
              <dt className="text-gray-500">Ortak stokta eşleşen SKU</dt>
              <dd className="text-lg font-semibold tabular-nums">{sharedCount}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-gray-500">Eşleşmeyen SKU</dt>
              <dd className="text-lg font-semibold tabular-nums">{Math.max(0, variantCount - sharedCount)}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-gray-500">
                <Link href="/stok?f=dusuk" className="hover:underline">Düşük stoktaki SKU</Link>
              </dt>
              <dd className={`text-lg font-semibold tabular-nums ${lowStock ? "text-amber-600" : ""}`}>{lowStock}</dd>
            </div>
            <div className="flex items-center justify-between py-3">
              <dt className="text-gray-500">Stoğu tükenen SKU</dt>
              <dd className={`text-lg font-semibold tabular-nums ${outOfStock ? "text-red-600" : ""}`}>{outOfStock}</dd>
            </div>
          </dl>
          <Link href="/stok" className="btn-ghost mt-3 w-full">Stok tablosunu aç</Link>
        </section>
      </div>
    </>
  );
}
