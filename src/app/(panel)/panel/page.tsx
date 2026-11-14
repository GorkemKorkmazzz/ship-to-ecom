import Link from "next/link";
import { getStores } from "@/lib/cache";
import { buildDashboard, type Metric } from "@/lib/dashboard";
import { requireUser } from "@/lib/session";
import { Flash, SyncButton, fmtDate, fmtMoney } from "../ui";
import { SalesChart } from "./sales-chart";

const RANGES = [7, 30, 90];
const ICON = {
  cart: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01",
  bag: "M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2",
  box: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10",
  wallet: "M4 7h14a2 2 0 012 2v9a2 2 0 01-2 2H4V7zm0 0l2-3h10M15 13h2",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  chart: "M5 20V10M12 20V4M19 20v-7",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M10 20v-6h4v6",
  cube: "M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  alert: "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  sync: "M4 4v5h5M20 20v-5h-5M5 15a7 7 0 0012 2M19 9A7 7 0 007 7",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  trophy: "M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3",
  check: "M5 13l4 4L19 7",
  info: "M12 16v-4M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};
function I({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

/** Küçük eğilim çizgisi (dönem içi günlük değerler). */
function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2 || values.every((v) => v === 0)) return <div className="h-8 w-24" />;
  const max = Math.max(...values), W = 96, H = 32;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(" ");
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-24" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>;
}

/** Değişim rozeti. iade gibi "azalması iyi" ölçülerde renk ters çevrilir. */
function Change({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-gray-400" title="Önceki dönemde veri yok">— önceki dönem yok</span>;
  const good = invert ? value <= 0 : value >= 0;
  return <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{value >= 0 ? "↗" : "↘"} %{Math.abs(value)}</span>;
}

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0" role="img" aria-label={`Ciro payı yüzde ${pct}`}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="#eef0f3" strokeWidth="7" />
      <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 40 40)" />
      <text x="40" y="40" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">%{pct}</text>
      <text x="40" y="54" textAnchor="middle" fontSize="10" fill="#6b7280">Pay</text>
    </svg>
  );
}

const STORE_COLOR = ["#0284c7", "#f59e0b", "#059669", "#7c3aed", "#e11d48"];
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((new Date().getTime() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} dk` : m < 1440 ? `${Math.round(m / 60)} sa` : `${Math.round(m / 1440)} gün`;
};

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; gun?: string; magaza?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);

  if (!stores.length) {
    return (
      <div className="card mx-auto mt-10 max-w-lg text-center">
        <h1 className="text-lg font-semibold">Hoş geldiniz</h1>
        <p className="mt-2 text-sm text-gray-600">Başlamak için e-ticaret sitenizi bağlayın. Aynı SKU&apos;ya sahip ürünler otomatik eşleşir ve tek stoktan düşer.</p>
        <Link href="/entegrasyonlar" className="btn mt-4">Mağaza bağla</Link>
      </div>
    );
  }

  const range = RANGES.includes(Number(sp.gun)) ? Number(sp.gun) : 30;
  const selected = stores.find((s) => s.id === sp.magaza);
  const d = await buildDashboard(user.id, stores, range, selected?.id);
  const money = (n: number) => fmtMoney(n, d.currency);
  const link = (patch: { gun?: number; magaza?: string | null }) => {
    const p = new URLSearchParams();
    const gun = patch.gun ?? range;
    const magaza = patch.magaza === undefined ? selected?.id : patch.magaza;
    if (gun !== 30) p.set("gun", String(gun));
    if (magaza) p.set("magaza", magaza);
    const s = p.toString();
    return s ? `/panel?${s}` : "/panel";
  };
  const k = d.kpis;
  const cards: { label: string; value: string; m: Metric | null; icon: string; tint: string; color: string; invert?: boolean; note?: string }[] = [
    { label: "Toplam Ciro", value: money(k.ciro.value), m: k.ciro, icon: ICON.cart, tint: "bg-indigo-50 text-indigo-600", color: "#4f46e5" },
    { label: "Toplam Sipariş", value: String(k.siparis.value), m: k.siparis, icon: ICON.bag, tint: "bg-sky-50 text-sky-600", color: "#0284c7" },
    { label: "Satılan Ürün", value: new Intl.NumberFormat("tr-TR").format(k.urun.value), m: k.urun, icon: ICON.box, tint: "bg-emerald-50 text-emerald-600", color: "#059669" },
    { label: "Ortalama Sipariş", value: money(k.ortalama.value), m: k.ortalama, icon: ICON.wallet, tint: "bg-amber-50 text-amber-600", color: "#f59e0b" },
    { label: "İade Edilen", value: String(k.iade.value), m: k.iade, icon: ICON.undo, tint: "bg-rose-50 text-rose-600", color: "#e11d48", invert: true },
    // Terk edilen sepet kaydı yoksa oran hesaplanamaz (%100 göstermek yanıltıcı olur).
    { label: "Sepet Dönüşümü", value: k.donusum.carts ? `%${k.donusum.value}` : "—", m: null, icon: ICON.trend, tint: "bg-violet-50 text-violet-600", color: "#7c3aed", note: k.donusum.carts ? `${k.donusum.carts} terk edilen sepete karşı` : "Terk edilen sepet verisi yok" },
  ];
  const INSIGHT: Record<string, [string, string]> = {
    up: [ICON.trend, "text-emerald-600 bg-emerald-50"], down: [ICON.alert, "text-red-600 bg-red-50"], info: [ICON.trophy, "text-amber-600 bg-amber-50"],
    warn: [ICON.alert, "text-amber-600 bg-amber-50"], ok: [ICON.check, "text-emerald-600 bg-emerald-50"],
  };
  const ACT: Record<string, [string, string]> = {
    order: [ICON.cart, "text-emerald-600 bg-emerald-50"], stock: [ICON.sync, "text-sky-600 bg-sky-50"], match: [ICON.link, "text-violet-600 bg-violet-50"],
    error: [ICON.alert, "text-red-600 bg-red-50"], info: [ICON.info, "text-gray-500 bg-gray-100"],
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hoş geldiniz!</h1>
          <p className="mt-0.5 text-sm text-gray-500">Mağazalarınızın performans özeti · son senkron {fmtDate(d.lastSyncAt ? new Date(d.lastSyncAt) : null)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5" aria-label="Dönem">
            {RANGES.map((r) => <Link key={r} href={link({ gun: r })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${range === r ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>Son {r} gün</Link>)}
          </div>
          <SyncButton path={link({})} />
        </div>
      </div>
      <Flash ok={sp.ok} hata={sp.hata} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.tint}`}><I d={c.icon} /></span>
              <span className="truncate text-sm text-gray-500">{c.label}</span>
            </div>
            <div className="mt-3 truncate text-2xl font-bold tabular-nums tracking-tight xl:text-xl 2xl:text-2xl">{c.value}</div>
            <div className="mt-2 flex items-end justify-between gap-2">
              {c.m ? <Change value={c.m.change} invert={c.invert} /> : <span className="text-xs text-gray-400">{c.note}</span>}
              {c.m && <Spark values={c.m.spark} color={c.color} />}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
        <section className="card xl:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><span className="text-indigo-600"><I d={ICON.chart} /></span>Satış Analizi</h2>
          <SalesChart days={d.days} daily={d.daily} currency={d.currency} />
        </section>
        <section className="card bg-gradient-to-b from-indigo-50/60 to-white">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="text-indigo-600"><I d={ICON.spark} /></span>Akıllı Özetler</h2>
          <p className="mt-0.5 text-xs text-gray-500">Son {range} gün · gerçek verilerden hesaplanır</p>
          <ul className="mt-4 divide-y divide-gray-100">
            {d.insights.map((x, i) => (
              <li key={i} className="flex gap-3 py-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${INSIGHT[x.tone][1]}`}><I d={INSIGHT[x.tone][0]} /></span>
                <p className="text-sm text-gray-700">
                  {x.text} {x.strong && <b className={x.tone === "up" ? "text-emerald-700" : x.tone === "down" ? "text-red-700" : "text-gray-900"}>{x.strong}</b>}
                  {x.link && <Link href={x.link.href} className="mt-0.5 block font-medium text-indigo-700 hover:underline">{x.link.label} →</Link>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr] [&>*]:min-w-0">
        <section className="card lg:col-span-2 xl:col-span-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="text-indigo-600"><I d={ICON.store} /></span>Mağaza Performansı</h2>
            <details className="relative">
              <summary className="btn-ghost cursor-pointer list-none">{selected?.label ?? "Tüm mağazalar"} ▾</summary>
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-lg">
                <Link href={link({ magaza: null })} className="block rounded-md px-2 py-1.5 hover:bg-gray-50">Tüm mağazalar</Link>
                {stores.map((s) => <Link key={s.id} href={link({ magaza: s.id })} className="block rounded-md px-2 py-1.5 hover:bg-gray-50">{s.label}</Link>)}
              </div>
            </details>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {d.storePerf.map((s) => {
              const color = STORE_COLOR[stores.findIndex((x) => x.id === s.id) % STORE_COLOR.length];
              return (
                <Link key={s.id} href={`/siparisler?magaza=${s.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3 hover:border-gray-300">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.error ? "#ef4444" : color }} />
                      <span className="truncate font-semibold">{s.label}</span>
                      <span className="text-xs font-semibold text-gray-500">ikas</span>
                    </div>
                    <div className="mt-2 text-xl font-bold tabular-nums">{money(s.ciro)}</div>
                    <div className="mt-1"><Change value={s.change} /></div>
                    <div className="mt-1.5 text-xs text-gray-500">{s.siparis} sipariş · {money(s.sepet)} ort. sepet</div>
                  </div>
                  <Ring pct={s.pay} color={color} />
                </Link>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="text-indigo-600"><I d={ICON.cube} /></span>Stok Durumu</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
            <div><dt className="text-sm text-gray-500">Toplam Ürün</dt><dd className="text-2xl font-bold tabular-nums">{new Intl.NumberFormat("tr-TR").format(d.stock.urun)}</dd></div>
            <div>
              <dt className="text-sm text-gray-500">Kritik Stok</dt>
              <dd className="flex items-center gap-1.5 text-2xl font-bold tabular-nums">{d.stock.kritik > 0 && <span className="text-red-600"><I d={ICON.alert} /></span>}{d.stock.kritik}</dd>
            </div>
            <div className="col-span-2">
              <dt className="flex items-center justify-between text-sm text-gray-500">Eşleşen SKU <span className="text-xs font-semibold text-emerald-700">%{d.stock.oran}</span></dt>
              <dd className="text-2xl font-bold tabular-nums">{new Intl.NumberFormat("tr-TR").format(d.stock.eslesen)}</dd>
              <div className="mt-2 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${d.stock.oran}%` }} /></div>
            </div>
            <div className="col-span-2 flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <span className="text-gray-400"><I d={ICON.clock} /></span>
              <div>
                <dt className="text-sm text-gray-500">En erken stok bitiş tahmini</dt>
                <dd className="text-lg font-bold">{d.stock.bitis === null ? "Satış hızı yok" : `${d.stock.bitis} gün`}</dd>
              </div>
            </div>
          </dl>
          <Link href="/stok" className="btn-ghost mt-4 w-full">Stok tablosunu aç</Link>
        </section>

        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><span className="text-indigo-600"><I d={ICON.list} /></span>Son İşlemler</h2>
            <Link href="/kayitlar" className="text-sm font-medium text-indigo-700 hover:underline">Tümünü gör</Link>
          </div>
          <ul className="mt-3 divide-y divide-gray-100">
            {d.activity.map((a, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ACT[a.kind][1]}`}><I d={ACT[a.kind][0]} className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{a.title}</div>
                  {a.sub && <div className="truncate text-xs text-gray-500">{a.sub}</div>}
                </div>
                <span className="shrink-0 text-xs text-gray-400">{ago(a.at)}</span>
              </li>
            ))}
            {!d.activity.length && <li className="py-8 text-center text-sm text-gray-500">Henüz işlem yok.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
