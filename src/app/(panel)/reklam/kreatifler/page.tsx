import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { CREATIVE_TYPES, MIN_IMPRESSIONS, SORTS, buildCreativeReport, creativeInsights, type CreativeRow } from "@/lib/ads/creatives";
import { buildAdReport, parseAdRange } from "@/lib/ads/report";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdShell } from "../ad-shell";
import { AdFilters, AdSourceNote, CoverageNote, adLink } from "../filters";
import { CreativeThumb } from "./thumb";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };
const statusTone = (s: string | null) => (!s ? "bg-gray-100 text-gray-600" : /ACTIVE|ENABLED/.test(s) ? "bg-emerald-100 text-emerald-700" : /PAUSED/.test(s) ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600");
type SP = { site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string; kampanya?: string; set?: string; tur?: string; sirala?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [provider, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const sites = (await buildAdReport(user.id, range, sp.site, { provider })).sites;
  const siteId = sp.site && sites.some((s) => s.id === sp.site) ? sp.site : null;
  const r = await buildCreativeReport(user.id, range, { siteId, provider, campaignId: sp.kampanya, adSetId: sp.set, type: sp.tur, sort: sp.sirala });
  const extra = { platform: provider, kampanya: r.applied.campaignId, set: r.applied.adSetId, tur: r.applied.type, sirala: r.sort === "spend" ? null : r.sort };
  const fmtN = (v: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  const money = (v: number | null, cur = r.currency) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(v));
  const t = r.total;
  const missing = r.coverage.state === "missing" || r.coverage.state === "none";
  const v = (s: string) => (missing ? "Veri yok" : s);
  const kpis: [string, string][] = [
    ["Kreatif sayısı", fmtN(r.count)], ["Toplam harcama", v(money(t.spend))], ["Gösterim", v(fmtN(t.impressions))], ["Tıklama", v(fmtN(t.clicks))],
    ["CTR", v(t.ctr === null ? "—" : `%${fmtN(t.ctr, 2)}`)], ["CPC", v(money(t.cpc))], ["Dönüşüm", v(fmtN(t.purchases, 1))], ["CPA", v(money(t.cpa))],
    ["Dönüşüm değeri", v(money(t.value))], ["ROAS", v(t.roas === null ? "—" : fmtN(t.roas, 2))],
  ];
  const groups: [keyof typeof r.groups, string, string][] = [
    ["best", "En iyi performans", "ROAS ve dönüşüm hacmi birlikte"], ["roas", "En yüksek ROAS", ""], ["cpa", "En düşük CPA", ""], ["ctr", "En yüksek CTR", ""],
    ["spend", "En çok harcama", "eşik uygulanmaz"], ["low", "Düşük performans", "yeterli veriyle; ROAS ortalamanın yarısının altında ya da dönüşümsüz"],
  ];
  // ROAS sıralaması da platform içidir (yorumların tabanı gibi).
  const okOf = (p: string) => r.rows.filter((x) => x.provider === p && x.impressions >= MIN_IMPRESSIONS && x.spend >= r.threshold && x.roas !== null).sort((a, b) => b.roas! - a.roas!);
  const okBy: Record<string, CreativeRow[]> = { meta: okOf("meta"), google: okOf("google") };
  const isGoogle = provider === "google";

  return (
    <>
      <AdShell tab="kreatif" title="Kreatif Analizi" desc={`${range.label} (${range.from} – ${range.to}) · karşılaştırma: ${r.prevRange.from} – ${r.prevRange.to} · ${r.count} kreatif`}
        platform={provider} conn={conn} range={range} siteId={siteId} switchBase="/reklam/kreatifler" keep={{ tur: r.applied.type, sirala: r.sort === "spend" ? null : r.sort }} />
      <AdFilters base="/reklam/kreatifler" range={range} sites={sites} siteId={siteId} extra={extra} campaigns={r.options.campaigns} campaignId={r.applied.campaignId}
        exportHref={adLink("/api/reklam/disa-aktar", range, siteId, { rapor: "kreatifler" }, extra)}
        selects={[
          { name: "set", label: isGoogle ? "Reklam grubu" : "Reklam seti / grubu", value: r.applied.adSetId, all: "Tümü", options: r.options.adSets.map((s) => [s.id, s.name]) },
          { name: "tur", label: "Kreatif türü", value: r.applied.type, all: "Tüm türler", options: Object.entries(CREATIVE_TYPES) },
          { name: "sirala", label: "Sıralama", value: r.sort, options: Object.entries(SORTS) },
        ]} />
      <CoverageNote coverage={r.coverage} />
      {r.demo && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800"><b>DEMO</b> · Bu rapordaki kreatifler demo bağlantısından gelir; görseller ve metrikler sentetiktir.</p>}
      {r.mixedCurrency && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Hesaplar farklı para birimlerinde; toplamlar dönüştürülmeden toplanmıştır. Platform filtresiyle ayrı inceleyin.</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 [&>*]:min-w-0">
        {kpis.map(([k, val]) => <div key={k} className="card p-3"><div className="truncate text-xs text-gray-500">{k}</div><div className="mt-1 truncate text-lg font-bold tabular-nums">{val}</div></div>)}
      </div>
      <p className="mt-2 text-xs text-gray-500">Oranlar toplamlardan hesaplanır (ör. CTR = toplam tıklama / toplam gösterim). Sınıflandırmalarda en az {fmtN(MIN_IMPRESSIONS)} gösterim ve {money(r.threshold)} harcama aranır.</p>

      {!r.rows.length ? (
        <div className="card mt-5 py-10 text-center text-sm text-gray-600">
          {!r.levelSynced ? "Reklam düzeyi veri henüz senkronlanmadı; bir sonraki senkronda gelir." : "Bu filtrelerle gösterimi olan kreatif yok."}
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.map(([k, title, hint]) => (
              <section key={k} className="card p-4">
                <h2 className="text-sm font-semibold">{title} {hint && <span className="font-normal text-gray-400">· {hint}</span>}</h2>
                {r.groups[k].length ? (
                  <ol className="mt-2 space-y-2">
                    {r.groups[k].map((x) => (
                      <li key={x.id} className="flex items-center gap-2">
                        <CreativeThumb src={x.thumbnailUrl} alt={x.name} type={x.creativeType} videoId={x.videoId} provider={x.provider} className="h-10 w-10 shrink-0 rounded" compact />
                        <Link href={adLink(`/reklam/kreatifler/${x.id}`, range, null)} className="min-w-0 flex-1 truncate text-sm hover:text-indigo-700 hover:underline">{x.name}</Link>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-700">
                          {k === "cpa" ? money(x.cpa, x.currency) : k === "ctr" ? `%${fmtN(x.ctr ?? 0, 2)}` : k === "spend" ? money(x.spend, x.currency) : x.roas === null ? "—" : `${fmtN(x.roas, 2)} ROAS`}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : <p className="mt-2 text-xs text-gray-500">Yeterli veriye sahip kreatif yok.</p>}
              </section>
            ))}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {r.rows.map((x) => <Card key={x.id} x={x} range={range} money={money} fmtN={fmtN} insights={creativeInsights(x, r.byProvider[x.provider], r.threshold, okBy[x.provider].indexOf(x) >= 0 ? { rank: okBy[x.provider].indexOf(x) + 1, of: okBy[x.provider].length } : undefined)} />)}
          </div>
        </>
      )}
      {r.providers.includes("google") && <p className="mt-4 rounded-lg bg-gray-50 px-4 py-2.5 text-xs text-gray-600">Google: reklam düzeyindeki metrikler gösterilir; asset&apos;ler (görsel, video, metin) ve performans etiketleri kartta listelenir. Asset düzeyinde metrik çekilmez. Google&apos;ın asset görünümü duyarlı görüntülü reklamları desteklemez; bu reklamlarda asset bilgisi yoktur.</p>}
      <AdSourceNote providers={r.providers} demo={r.demo} />
    </>
  );
}

function Card({ x, range, money, fmtN, insights }: { x: CreativeRow; range: { from: string; to: string; preset: string | null }; money: (v: number | null, c?: string) => string; fmtN: (v: number, d?: number) => string; insights: { tone: string; text: string }[] }) {
  const m = (v: number | null) => money(v, x.currency);
  const cells: [string, string][] = [
    ["Harcama", m(x.spend)], ["Gösterim", fmtN(x.impressions)], ["Tıklama", fmtN(x.clicks)], ["CTR", x.ctr === null ? "—" : `%${fmtN(x.ctr, 2)}`],
    ["CPC", m(x.cpc)], [x.provider === "google" ? "Dönüşüm" : "Satın alma", fmtN(x.purchases, 1)], ["CPA", m(x.cpa)], ["Değer", m(x.value)], ["ROAS", x.roas === null ? "—" : fmtN(x.roas, 2)],
  ];
  const labels = x.assets.filter((a) => a.label && !["UNSPECIFIED", "UNKNOWN", "NOT_APPLICABLE"].includes(a.label));
  return (
    <article className="card flex min-w-0 flex-col overflow-hidden p-0">
      <Link href={adLink(`/reklam/kreatifler/${x.id}`, range, null)} className="relative block">
        <CreativeThumb src={x.thumbnailUrl} alt={x.name} type={x.creativeType} videoId={x.videoId} provider={x.provider} className="aspect-[4/3]" />
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className={`badge ${PROVIDER[x.provider][1]}`}>{PROVIDER[x.provider][0]}</span>
          {x.creativeType && <span className="badge bg-white/90 text-gray-700">{CREATIVE_TYPES[x.creativeType] ?? x.creativeType}</span>}
          {x.demo && <span className="badge bg-amber-400 text-amber-950">DEMO</span>}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={adLink(`/reklam/kreatifler/${x.id}`, range, null)} className="min-w-0 font-semibold hover:text-indigo-700 hover:underline">{x.name}</Link>
          <span className={`badge shrink-0 ${statusTone(x.status)}`}>{x.status ?? "—"}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{x.campaign.name} · {x.adSet.name}</p>
        {!x.creativeType && <p className="mt-1 text-[11px] text-gray-400">Kreatif bilgisi henüz senkronlanmadı.</p>}
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
          {cells.map(([k, val]) => <div key={k} className="min-w-0"><dt className="truncate text-[11px] text-gray-500">{k}</dt><dd className="truncate font-semibold tabular-nums">{val}</dd></div>)}
        </dl>
        {labels.length > 0 && (
          <p className="mt-3 text-[11px] text-gray-500">Asset etiketleri: {[...new Set(labels.map((a) => a.label))].map((l) => `${l} ×${labels.filter((a) => a.label === l).length}`).join(" · ")}</p>
        )}
        {insights.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2 text-xs">
            {insights.slice(0, 2).map((i) => <li key={i.text} className={i.tone === "good" ? "text-emerald-700" : i.tone === "bad" ? "text-red-700" : "text-gray-600"}>{i.tone === "good" ? "▲" : i.tone === "bad" ? "▼" : "•"} {i.text}</li>)}
          </ul>
        )}
      </div>
    </article>
  );
}
