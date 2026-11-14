import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { buildAdDashboard, buildAdReport, parseAdRange } from "@/lib/ads/report";
import { requireUser } from "@/lib/session";
import { PageHeader } from "../ui";
import { AdChart } from "./ad-chart";
import { AdFilters, adLink } from "./filters";

const PROVIDER: Record<string, [string, string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700", "#2563eb"], google: ["Google Ads", "bg-amber-100 text-amber-800", "#f59e0b"] };

/** Önceki döneme göre değişim (%). Önceki dönemde veri yoksa null. */
const change = (now: number | null, prev: number | null | undefined) => (now === null || !prev ? null : Math.round(((now - prev) / prev) * 1000) / 10);

function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="text-xs text-gray-400">önceki dönem yok</span>;
  const good = invert ? v <= 0 : v >= 0;
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{v >= 0 ? "↗" : "↘"} %{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(v))}</span>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string; gun?: string; baslangic?: string; bitis?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const r = await buildAdReport(user.id, range, sp.site);
  const d = await buildAdDashboard(user.id, range, r.site?.id ?? null);
  const fmtN = (v: number, dg = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg, minimumFractionDigits: dg }).format(v);
  const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: r.currency }).format(v));
  const t = r.total, p = d.previous;
  // Maliyet ölçülerinde (CPC) artış kötüdür; renk ters çevrilir.
  const kpis: { label: string; value: string; delta: number | null; invert?: boolean; hint?: string }[] = [
    { label: "Toplam harcama", value: money(t.spend), delta: change(t.spend, p?.spend), invert: true },
    { label: "Platform cirosu", value: money(t.value), delta: change(t.value, p?.value), hint: "Meta ve Google Ads'in raporladığı dönüşüm değeri; gerçek sipariş cirosu değildir." },
    { label: "Satın alma / dönüşüm", value: fmtN(t.purchases, 1), delta: change(t.purchases, p?.purchases) },
    { label: "Ortalama ROAS", value: t.roas === null ? "—" : fmtN(t.roas, 2), delta: change(t.roas, p?.roas) },
    { label: "CPC", value: money(t.cpc), delta: change(t.cpc, p?.cpc), invert: true },
    { label: "CTR", value: t.ctr === null ? "—" : `%${fmtN(t.ctr, 2)}`, delta: change(t.ctr, p?.ctr) },
  ];
  const active = r.platforms.filter((x) => x.accounts);

  return (
    <>
      <PageHeader title="Reklam performansı" desc={`${r.site ? `${r.site.name} (${r.site.domain})` : "Tüm siteler"} · ${range.from} – ${range.to} · karşılaştırma: ${d.prevRange.from} – ${d.prevRange.to}`}>
        <div className="flex gap-2">
          <Link href={adLink("/reklam-raporu", range, r.site?.id ?? null)} className="btn-ghost">Ayrıntılı rapor</Link>
          <Link href="/reklam-hesaplari" className="btn-ghost">Reklam hesapları</Link>
        </div>
      </PageHeader>
      <AdFilters base="/reklam" range={range} sites={r.sites} siteId={r.site?.id ?? null} />

      {!r.accounts.length ? (
        <div className="card py-10 text-center text-sm text-gray-600">
          {r.site ? "Bu siteye bağlı ve raporlamaya dahil edilmiş reklam hesabı yok." : "Raporlamaya dahil edilmiş reklam hesabı yok."}{" "}
          <Link href="/reklam-hesaplari" className="font-medium text-indigo-700 hover:underline">Reklam hesaplarını yönet</Link>
        </div>
      ) : (
        <>
          {r.accounts.some((a) => a.broken) && (
            <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
              Bazı reklam bağlantıları kesildi; bu hesapların verileri güncellenmiyor. <Link href="/reklam-hesaplari" className="font-medium underline">Yeniden bağlayın</Link>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
            {kpis.map((k) => (
              <div key={k.label} className="card p-4" title={k.hint}>
                <div className="truncate text-sm text-gray-500">{k.label}</div>
                <div className="mt-1 truncate text-xl font-bold tabular-nums">{k.value}</div>
                <div className="mt-2"><Delta v={k.delta} invert={k.invert} /></div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
            <section className="card xl:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">Günlük performans</h2>
              <AdChart days={d.days} series={d.series} currency={r.currency} providers={active.map((x) => x.provider)} />
            </section>
            <section className="card">
              <h2 className="text-lg font-semibold">Meta ve Google karşılaştırması</h2>
              <div className="mt-4 space-y-5">
                {(["spend", "value"] as const).map((k) => {
                  const sum = active.reduce((a, x) => a + x[k], 0);
                  return (
                    <div key={k}>
                      <div className="text-sm text-gray-500">{k === "spend" ? "Harcama payı" : "Platform cirosu payı"}</div>
                      <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-gray-100">
                        {active.map((x) => <div key={x.provider} style={{ width: `${sum ? (x[k] / sum) * 100 : 0}%`, background: PROVIDER[x.provider][2] }} />)}
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-gray-600">
                        {active.map((x) => <span key={x.provider}>{PROVIDER[x.provider][0]} %{sum ? Math.round((x[k] / sum) * 100) : 0}</span>)}
                      </div>
                    </div>
                  );
                })}
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-400"><th className="pb-1 font-medium">Ölçü</th>{active.map((x) => <th key={x.provider} className="pb-1 text-right font-medium">{PROVIDER[x.provider][0]}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {([["ROAS", (x: (typeof active)[number]) => (x.roas === null ? "—" : fmtN(x.roas, 2))], ["CPC", (x: (typeof active)[number]) => money(x.cpc)], ["CTR", (x: (typeof active)[number]) => (x.ctr === null ? "—" : `%${fmtN(x.ctr, 2)}`)], ["Dönüşüm", (x: (typeof active)[number]) => fmtN(x.purchases, 1)]] as const).map(([label, f]) => (
                      <tr key={label}><td className="py-1.5 text-gray-500">{label}</td>{active.map((x) => <td key={x.provider} className="py-1.5 text-right font-semibold tabular-nums">{f(x)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {active.length < 2 && <p className="text-xs text-gray-500">Karşılaştırma için iki platformda da raporlamaya dahil hesap olmalı.</p>}
              </div>
            </section>
          </div>

          <section className="card mt-5 overflow-x-auto p-0">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-lg font-semibold">Kampanya performansı</h2>
              <Link href={adLink("/reklam/kampanyalar", range, r.site?.id ?? null)} className="text-sm font-medium text-indigo-700 hover:underline">Tüm kampanyalar ({d.campaigns.length}) →</Link>
            </div>
            <table className="mt-3 w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>{["Kampanya", "Harcama", "Tıklama", "CTR", "CPC", "Dönüşüm", "Dönüşüm değeri", "ROAS"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.campaigns.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td className="td">
                      <div className="flex items-center gap-2"><span className={`badge ${PROVIDER[c.provider][1]}`}>{PROVIDER[c.provider][0]}</span><Link href={adLink(`/reklam/kampanyalar/${c.id}`, range, null)} className="font-medium hover:text-indigo-700 hover:underline">{c.name}</Link></div>
                      <div className="text-xs text-gray-500">{c.account}{c.status ? ` · ${c.status}` : ""}</div>
                    </td>
                    <td className="td text-right tabular-nums">{money(c.spend)}</td>
                    <td className="td text-right tabular-nums">{fmtN(c.clicks)}</td>
                    <td className="td text-right tabular-nums">{c.ctr === null ? "—" : `%${fmtN(c.ctr, 2)}`}</td>
                    <td className="td text-right tabular-nums">{money(c.cpc)}</td>
                    <td className="td text-right tabular-nums">{fmtN(c.purchases, 1)}</td>
                    <td className="td text-right tabular-nums">{money(c.value)}</td>
                    <td className="td text-right font-semibold tabular-nums">{c.roas === null ? "—" : fmtN(c.roas, 2)}</td>
                  </tr>
                ))}
                {!d.campaigns.length && <tr><td className="td py-8 text-center text-gray-500" colSpan={8}>Bu dönemde kampanya verisi yok.</td></tr>}
              </tbody>
            </table>
            {d.campaigns.length > 15 && <p className="px-5 py-3 text-xs text-gray-500">Harcamaya göre ilk 15 kampanya gösteriliyor.</p>}
          </section>
        </>
      )}
    </>
  );
}
