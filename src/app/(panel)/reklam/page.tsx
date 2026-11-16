import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { CREATIVE_TYPES, buildCreativeReport } from "@/lib/ads/creatives";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { buildAdDashboard, buildAdReport, parseAdRange } from "@/lib/ads/report";
import { requireUser } from "@/lib/session";
import { AdShell, PLATFORM_NAME, PlatformMark } from "./ad-shell";
import { AdChart } from "./ad-chart";
import { AdFilters, AdSourceNote, CoverageNote, adLink } from "./filters";

const PROVIDER: Record<string, [string, string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700", "#2563eb"], google: ["Google Ads", "bg-amber-100 text-amber-800", "#f59e0b"] };

/** Önceki döneme göre değişim (%). Önceki dönemde veri yoksa null. */
const change = (now: number | null, prev: number | null | undefined) => (now === null || !prev ? null : Math.round(((now - prev) / prev) * 1000) / 10);

function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="text-xs text-gray-400">önceki dönem yok</span>;
  const good = invert ? v <= 0 : v >= 0;
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{v >= 0 ? "↗" : "↘"} %{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(v))}</span>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string; kampanya?: string; karsilastir?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  // Platform merkezi seçimden gelir (URL > son seçim çerezi > Meta); Meta ve Google verileri birlikte toplanmaz.
  const provider = await resolveAdPlatform(sp.platform);
  const compare = sp.karsilastir !== "0";
  const [r0, conn, both] = await Promise.all([buildAdReport(user.id, range, sp.site, { provider }), adConnections(user.id), buildAdReport(user.id, range, sp.site)]);
  // Kampanya yalnızca kapsamdaki kampanyalardan biriyse uygulanır (başka kullanıcının kimliği yok sayılır).
  const campaignId = sp.kampanya && r0.campaignOptions.some((c) => c.id === sp.kampanya) ? sp.kampanya : null;
  const r = campaignId ? await buildAdReport(user.id, range, sp.site, { provider, campaignId }) : r0;
  const d = await buildAdDashboard(user.id, range, r.site?.id ?? null, { provider, campaignId });
  const extra = { platform: provider, kampanya: campaignId, karsilastir: compare ? null : "0" };
  const cr = await buildCreativeReport(user.id, range, { siteId: r.site?.id ?? null, provider, campaignId });
  const typeSpend = new Map<string, number>();
  for (const x of cr.rows) typeSpend.set(x.creativeType ?? "?", (typeSpend.get(x.creativeType ?? "?") ?? 0) + x.spend);
  const typeTotal = [...typeSpend.values()].reduce((a, b) => a + b, 0);
  const TYPE_COLOR = ["#4f46e5", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#94a3b8"];
  const types = [...typeSpend.entries()].sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ k, label: k === "?" ? "Tür bilinmiyor" : CREATIVE_TYPES[k] ?? k, share: typeTotal ? (v / typeTotal) * 100 : 0, color: TYPE_COLOR[i % TYPE_COLOR.length] }));
  const missing = d.coverage.state === "missing" || d.coverage.state === "none";
  const fmtN = (v: number, dg = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg, minimumFractionDigits: dg }).format(v);
  const money0 = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: r.currency }).format(v));
  // Senkronla kapsanmayan dönemde değerler 0 değil "Veri yok" gösterilir.
  const money = (v: number | null) => (missing ? "Veri yok" : money0(v));
  const t = r.total, p = d.previous;
  // Maliyet ölçülerinde (CPC) artış kötüdür; renk ters çevrilir.
  const kpis: { label: string; value: string; delta: number | null; invert?: boolean; hint?: string; d: string; tone: string }[] = [
    { label: "Toplam harcama", value: money(t.spend), delta: change(t.spend, p?.spend), invert: true, d: "M3 7h18v12H3zM3 11h18M16 15h2", tone: "bg-indigo-50 text-indigo-600" },
    { label: "Reklam geliri", value: money(t.value), delta: change(t.value, p?.value), hint: `${PLATFORM_NAME[provider]}'in raporladığı dönüşüm değeri; gerçek sipariş cirosu değildir.`, d: "M3 17l6-6 4 4 8-8M15 7h6v6", tone: "bg-emerald-50 text-emerald-600" },
    { label: "Satın alma / dönüşüm", value: missing ? "Veri yok" : fmtN(t.purchases, 1), delta: change(t.purchases, p?.purchases), d: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01", tone: "bg-sky-50 text-sky-600" },
    { label: "ROAS", value: missing ? "Veri yok" : t.roas === null ? "—" : fmtN(t.roas, 2), delta: change(t.roas, p?.roas), d: "M4 20V10M10 20V4M16 20v-8M22 20H2", tone: "bg-violet-50 text-violet-600" },
    { label: "CPC", value: money(t.cpc), delta: change(t.cpc, p?.cpc), invert: true, d: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6", tone: "bg-amber-50 text-amber-600" },
    { label: "CTR", value: missing ? "Veri yok" : t.ctr === null ? "—" : `%${fmtN(t.ctr, 2)}`, delta: change(t.ctr, p?.ctr), d: "M4 4l7 17 2.5-7.5L21 11z", tone: "bg-pink-50 text-pink-600" },
  ];

  return (
    <>
      <AdShell tab="genel" title="Reklam Analitiği" desc={`Reklam performansınızı platform bazında inceleyin · ${r.site ? r.site.name : "Tüm mağazalar"} · ${range.label} (${range.from} – ${range.to})${compare ? ` · karşılaştırma: ${d.prevRange.from} – ${d.prevRange.to}${d.prevCoverage === "missing" ? " (veri yok)" : ""}` : ""}`}
        platform={provider} conn={conn} range={range} siteId={r.site?.id ?? null} switchBase="/reklam" keep={{ karsilastir: compare ? null : "0" }}>
        <Link href="/reklam-hesaplari" className="btn-ghost">Reklam hesapları</Link>
      </AdShell>
      <AdFilters base="/reklam" range={range} sites={r.sites} siteId={r.site?.id ?? null} extra={extra} campaigns={r0.campaignOptions} campaignId={campaignId}
        selects={[{ name: "karsilastir", label: "Karşılaştırma", value: compare ? "" : "0", options: [["", "Önceki dönemle karşılaştır"], ["0", "Karşılaştırma kapalı"]] }]}
        exportHref={adLink("/api/reklam/disa-aktar", range, r.site?.id ?? null, { rapor: "kampanyalar" }, extra)} />
      {r.accounts.length > 0 && <CoverageNote coverage={d.coverage} />}

      {!r.accounts.length ? (
        <div className="card py-10 text-center text-sm text-gray-600">
          {r.site ? `Bu siteye bağlı ve raporlamaya dahil edilmiş ${PLATFORM_NAME[provider]} hesabı yok.` : `Raporlamaya dahil edilmiş ${PLATFORM_NAME[provider]} hesabı yok.`}{" "}
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
              <div key={k.label} className="card p-4 transition-shadow hover:shadow-md" title={k.hint}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${k.tone}`}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={k.d} /></svg></span>
                  <span className="truncate text-sm text-gray-500">{k.label}</span>
                </div>
                <div className="mt-2 truncate text-xl font-bold tabular-nums">{k.value}</div>
                {compare && <div className="mt-2"><Delta v={k.delta} invert={k.invert} /></div>}
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3 [&>*]:min-w-0">
            <section className="card xl:col-span-2">
              <h2 className="mb-3 text-lg font-semibold">Performans grafikleri <span className="text-sm font-normal text-gray-500">· {PLATFORM_NAME[provider]}</span></h2>
              <AdChart days={d.days} series={d.series} currency={r.currency} providers={[]} />
            </section>
            <section className="card">
              <h2 className="text-lg font-semibold">Platform özeti</h2>
              <p className="mt-0.5 text-xs text-gray-500">Her platform kendi verisiyle gösterilir; değerler birbirine eklenmez.</p>
              <div className="mt-3 space-y-3">
                {both.platforms.map((x) => (
                  <Link key={x.provider} href={adLink("/reklam", range, r.site?.id ?? null, { platform: x.provider })} className={`block rounded-xl border p-3 transition-colors ${x.provider === provider ? "border-indigo-300 bg-indigo-50/50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <div className="flex items-center gap-2 font-semibold"><PlatformMark p={x.provider} className="h-5 w-5" />{PLATFORM_NAME[x.provider]}{!x.accounts && <span className="ml-auto text-xs font-normal text-gray-500">hesap yok</span>}</div>
                    {x.accounts > 0 && (
                      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                        <dt className="text-gray-500">Harcama</dt><dd className="text-right font-semibold tabular-nums">{money(x.spend)}</dd>
                        <dt className="text-gray-500">Gösterim</dt><dd className="text-right tabular-nums">{fmtN(x.impressions)}</dd>
                        <dt className="text-gray-500">Tıklama</dt><dd className="text-right tabular-nums">{fmtN(x.clicks)}</dd>
                        <dt className="text-gray-500">Dönüşüm</dt><dd className="text-right tabular-nums">{fmtN(x.purchases, 1)}</dd>
                        <dt className="text-gray-500">ROAS</dt><dd className="text-right font-semibold tabular-nums">{x.roas === null ? "—" : fmtN(x.roas, 2)}</dd>
                      </dl>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <section className="card mt-5 overflow-x-auto p-0">
            <div className="flex items-center justify-between px-5 pt-4">
              <h2 className="text-lg font-semibold">Kampanya performansı</h2>
              <Link href={adLink("/reklam/kampanyalar", range, r.site?.id ?? null, {}, { platform: provider })} className="text-sm font-medium text-indigo-700 hover:underline">Tüm kampanyalar ({d.campaigns.length}) →</Link>
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
      {r.accounts.length > 0 && (
        <section className="card mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Kreatif türleri</h2>
            <Link href={adLink("/reklam/kreatifler", range, r.site?.id ?? null, { platform: provider })} className="text-sm font-medium text-indigo-700 hover:underline">Kreatif analizi →</Link>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">Dönem harcamasının kreatif türlerine dağılımı ({cr.count} kreatif, {PLATFORM_NAME[provider]}).</p>
          {types.length && typeTotal ? (
            <>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-gray-100">{types.map((x) => <div key={x.k} style={{ width: `${x.share}%`, background: x.color }} title={x.label} />)}</div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {types.map((x) => <li key={x.k} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{x.label}<span className="ml-auto font-semibold tabular-nums">%{fmtN(x.share, 1)}</span></li>)}
              </ul>
            </>
          ) : <p className="mt-3 text-sm text-gray-500">Bu dönemde kreatif düzeyinde harcama verisi yok.</p>}
        </section>
      )}
      <AdSourceNote providers={[provider]} demo={r.demo} />
    </>
  );
}
