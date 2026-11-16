import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CREATIVE_TYPES, MIN_IMPRESSIONS, buildCreativeDetail, buildCreativeReport, creativeInsights } from "@/lib/ads/creatives";
import { parseAdRange } from "@/lib/ads/report";
import { adConnections, type AdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdShell } from "../../ad-shell";
import { AdFilters, AdSourceNote, CoverageNote, adLink } from "../../filters";
import { MetricChart } from "../../metric-chart";
import { CreativeThumb } from "../thumb";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };
const change = (now: number | null, prev: number | null | undefined) => (now === null || prev === null || prev === undefined || prev === 0 ? null : ((now - prev) / prev) * 100);

function Delta({ v, invert = false }: { v: number | null; invert?: boolean }) {
  if (v === null) return <span className="text-xs text-gray-400">karşılaştırma yok</span>;
  const good = invert ? v <= 0 : v >= 0;
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{v >= 0 ? "↗" : "↘"} %{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(v))}</span>;
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gun?: string; baslangic?: string; bitis?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const { id } = await params;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [d, conn] = await Promise.all([buildCreativeDetail(user.id, id, range), adConnections(user.id)]);
  if (!d) notFound(); // başka kullanıcının reklamı görünmez
  // Yorumların karşılaştırma tabanı: aynı platformdaki tüm kreatiflerin dönem toplamı. Eşik, kreatifler sayfasının "tüm platformlar" görünümüyle aynıdır.
  const base = await buildCreativeReport(user.id, range, {});
  const ok = base.rows.filter((x) => x.provider === d.provider && x.impressions >= MIN_IMPRESSIONS && x.spend >= base.threshold && x.roas !== null).sort((a, b) => b.roas! - a.roas!);
  const rank = ok.findIndex((x) => x.id === d.ad.id);
  const insights = creativeInsights({ ...d.total, prev: d.prev }, base.byProvider[d.provider], base.threshold, rank >= 0 ? { rank: rank + 1, of: ok.length } : undefined);
  const cur = d.account.currency ?? "TRY";
  const isGoogle = d.provider === "google";
  const fmtN = (v: number, dg = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg, minimumFractionDigits: dg }).format(v);
  const moneyRaw = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(v);
  const missing = d.coverage.state === "missing" || d.coverage.state === "none";
  const money = (v: number | null) => (missing ? "Veri yok" : v === null ? "—" : moneyRaw(v));
  const t = d.total, p = d.prev;
  const kpis: [string, string, number | null, boolean?][] = [
    ["Harcama", money(t.spend), change(t.spend, p?.spend), true], ["Gösterim", missing ? "Veri yok" : fmtN(t.impressions), change(t.impressions, p?.impressions)],
    ["Tıklama", missing ? "Veri yok" : fmtN(t.clicks), change(t.clicks, p?.clicks)], ["CTR", missing ? "Veri yok" : t.ctr === null ? "—" : `%${fmtN(t.ctr, 2)}`, change(t.ctr, p?.ctr)],
    ["CPC", money(t.cpc), change(t.cpc, p?.cpc), true], ["CPM", money(t.cpm), change(t.cpm, p?.cpm), true],
    [isGoogle ? "Dönüşüm" : "Satın alma", missing ? "Veri yok" : fmtN(t.purchases, 1), change(t.purchases, p?.purchases)], ["CPA", money(t.cpa), change(t.cpa, p?.cpa), true],
    ["Dönüşüm değeri", money(t.value), change(t.value, p?.value)], ["ROAS", missing ? "Veri yok" : t.roas === null ? "—" : fmtN(t.roas, 2), change(t.roas, p?.roas)],
  ];
  const days = d.daily.map((x) => x.date), unc = d.daily.map((x) => !x.covered);
  const assets = d.ad.assets;

  return (
    <>
      <AdShell tab="kreatif" title={d.ad.name} desc={`${PROVIDER[d.provider][0]} · ${d.account.name} · reklam ${d.ad.externalId} · ${range.label} (${range.from} – ${range.to}) · karşılaştırma: ${d.prevRange.from} – ${d.prevRange.to}${d.prev ? "" : " (veri yok)"}`}
        platform={d.provider as AdPlatform} conn={conn} range={range} siteId={null} switchBase="/reklam/kreatifler">
        <Link href={adLink("/reklam/kreatifler", range, null, { platform: d.provider })} className="btn-ghost">← Kreatifler</Link>
      </AdShell>
      <AdFilters base={`/reklam/kreatifler/${d.ad.id}`} range={range} sites={[]} siteId={null} />
      <CoverageNote coverage={d.coverage} />
      {d.demo && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800"><b>DEMO</b> · Bu kreatif demo bağlantısından gelir; görsel ve metrikler sentetiktir.</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <section className="card overflow-hidden p-0">
          <CreativeThumb src={d.ad.thumbnailUrl} alt={d.ad.name} type={d.ad.creativeType} videoId={d.ad.videoId} provider={d.provider} className="aspect-square" />
          <div className="space-y-1.5 p-4 text-sm">
            <div className="flex flex-wrap gap-1">
              <span className={`badge ${PROVIDER[d.provider][1]}`}>{PROVIDER[d.provider][0]}</span>
              {d.ad.creativeType && <span className="badge bg-gray-100 text-gray-700">{CREATIVE_TYPES[d.ad.creativeType] ?? d.ad.creativeType}</span>}
              {d.ad.status && <span className="badge bg-gray-100 text-gray-700">{d.ad.status}</span>}
              {d.demo && <span className="badge bg-amber-400 text-amber-950">DEMO</span>}
            </div>
            <p><span className="text-gray-500">Kampanya:</span> <Link href={adLink(`/reklam/kampanyalar/${d.campaign.id}`, range, null)} className="font-medium text-indigo-700 hover:underline">{d.campaign.name}</Link></p>
            <p><span className="text-gray-500">{isGoogle ? "Reklam grubu" : "Reklam seti"}:</span> {d.adSet.name}</p>
            {d.campaign.objective && <p><span className="text-gray-500">Hedef:</span> {d.campaign.objective}</p>}
            {!isGoogle && <p className="text-xs text-gray-500">Meta object_type: {d.ad.objectType ?? "veri yok"}{d.ad.creativeId ? ` · kreatif ${d.ad.creativeId}` : ""}</p>}
            {isGoogle && <p className="text-xs text-gray-500">Reklam türü: {d.ad.adType ?? "veri yok"}</p>}
            <p className="text-xs text-gray-400">Kreatif bilgisi: {d.ad.creativeSyncedAt ? `son senkron ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d.ad.creativeSyncedAt)}` : "henüz senkronlanmadı"}</p>
          </div>
        </section>

        <div className="min-w-0 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 [&>*]:min-w-0">
            {kpis.map(([k, val, dl, inv]) => <div key={k} className="card p-3"><div className="truncate text-xs text-gray-500">{k}</div><div className="mt-1 truncate font-bold tabular-nums">{val}</div><div className="mt-1"><Delta v={missing ? null : dl} invert={inv} /></div></div>)}
          </div>
          <section className="card">
            <h2 className="font-semibold">Performans yorumları</h2>
            {insights.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {insights.map((i) => <li key={i.text} className={i.tone === "good" ? "text-emerald-700" : i.tone === "bad" ? "text-red-700" : "text-gray-700"}>{i.tone === "good" ? "▲" : i.tone === "bad" ? "▼" : "•"} {i.text}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Yorum için yeterli veri yok (en az {fmtN(MIN_IMPRESSIONS)} gösterim ve {moneyRaw(base.threshold)} harcama gerekir) ya da öne çıkan bir sapma bulunmuyor.</p>
            )}
            <p className="mt-2 text-xs text-gray-400">Yorumlar kurallara dayalıdır; karşılaştırma tabanı aynı platformdaki tüm kreatiflerin dönem toplamıdır.</p>
          </section>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricChart uncovered={unc} title="Günlük harcama" days={days} current={d.daily.map((x) => x.spend)} previous={d.prevDaily.map((x) => x.spend)} format={moneyRaw} />
        <MetricChart uncovered={unc} title="Günlük CTR (%)" days={days} current={d.daily.map((x) => x.ctr)} previous={d.prevDaily.map((x) => x.ctr)} format={(v) => `%${fmtN(v, 2)}`} color="#0ea5e9" />
        <MetricChart uncovered={unc} title={`Günlük ${isGoogle ? "dönüşüm" : "satın alma"}`} days={days} current={d.daily.map((x) => x.purchases)} previous={d.prevDaily.map((x) => x.purchases)} format={(v) => fmtN(v, 1)} color="#10b981" />
        <MetricChart uncovered={unc} title="Günlük ROAS" days={days} current={d.daily.map((x) => x.roas)} previous={d.prevDaily.map((x) => x.roas)} format={(v) => fmtN(v, 2)} color="#f59e0b" />
      </div>

      {isGoogle && (
        <section className="card mt-5 overflow-x-auto p-0">
          <h2 className="px-5 pt-4 font-semibold">Asset&apos;ler <span className="text-sm font-normal text-gray-500">· {assets.length}</span></h2>
          {assets.length ? (
            <table className="mt-3 w-full">
              <thead className="border-b border-gray-200 bg-gray-50"><tr>{["Rol", "Tür", "İçerik", "Performans etiketi"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {assets.map((a, i) => (
                  <tr key={i}>
                    <td className="td text-xs">{a.fieldType ?? "—"}</td>
                    <td className="td text-xs">{a.type ?? "—"}</td>
                    <td className="td text-sm">{a.text ?? (a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">Görseli aç</a> : a.videoId ? <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(a.videoId)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">YouTube {a.videoId}</a> : "—")}</td>
                    <td className="td text-xs">{a.label ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="px-5 py-4 text-sm text-gray-500">{d.ad.creativeType === "DISPLAY" ? "Duyarlı görüntülü reklamlarda Google asset görünümü desteklenmez; asset bilgisi yok." : "Bu reklam için asset bilgisi dönmedi."}</p>}
          <p className="px-5 pb-4 text-xs text-gray-500">Google asset&apos;leri için yalnızca performans etiketi (BEST, GOOD, LOW, LEARNING…) gösterilir; asset düzeyinde metrik çekilmez.</p>
        </section>
      )}
      <AdSourceNote providers={[d.provider]} demo={d.demo} />
    </>
  );
}
