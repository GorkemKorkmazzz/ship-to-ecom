import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { FUNNEL_SOURCES, MIN_BASE, buildFunnel, type FunnelSource, type StageRow } from "@/lib/ads/funnel";
import { parseAdRange } from "@/lib/ads/report";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdShell } from "../ad-shell";
import { AdFilters, CoverageNote, adLink } from "../filters";

type SP = { platform?: string; site?: string; gun?: string; baslangic?: string; bitis?: string; kaynak?: string; kampanya?: string; hesap?: string; trafik?: string };
const SOURCE_NOTE: Record<FunnelSource, string> = {
  meta: "Kaynak: Meta Marketing API Insights. Eylemler reklam hesabının atıf ayarıyla sayılır (Meta varsayılanı 7 gün tıklama + 1 gün görüntüleme). Her aşamada tek eylem türü alınır (omni_ varsa o, yoksa piksel türü); ikisi toplanmaz.",
  google: "Kaynak: Google Ads API (gösterim, tıklama, dönüşüm). GA4 segmenti ayrı bir kaynaktır; iki zincir arasında oran hesaplanmaz.",
  ga4: "Kaynak: GA4 Data API (sessionSource / sessionMedium / sessionCampaignName). GA4 kendi atıf ve oturum tanımını kullanır.",
  ikas: "Kaynak: ikas siparişleri (iptal ve taslak hariç). Ciro gerçek sipariş tutarıdır; reklam platformlarının dönüşümleri eklenmez.",
};

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  // Varsayılan kaynak seçili reklam platformudur; GA4 ve ikas ayrı kaynak sekmeleridir.
  const [platform, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const source = (FUNNEL_SOURCES.find(([k]) => k === sp.kaynak)?.[0] ?? platform) as FunnelSource;
  const f0 = await buildFunnel(user.id, range, null, { source: "ikas" }).then((x) => x.sites);
  const siteId = sp.site && f0.some((s) => s.id === sp.site) ? sp.site : null;
  const f = await buildFunnel(user.id, range, siteId, { source, campaignId: sp.kampanya, accountId: sp.hesap, traffic: sp.trafik });
  const traffic = f.ga4?.traffic ?? f.ikas?.traffic ?? null;
  const extra = { platform, kaynak: source === platform ? null : source, kampanya: f.campaignId, hesap: f.accountId, trafik: traffic };
  const fmtN = (v: number | null, d = 0) => (v === null ? "Veri yok" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v));
  const fmtP = (v: number | null) => (v === null ? "—" : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(v)}`);
  const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: f.currency }).format(v));
  const selects: { name: string; label: string; value: string | null; options: [string, string][]; all?: string }[] = [];
  if (f.accountOptions.length) selects.push({ name: "hesap", label: "Reklam hesabı", value: f.accountId, all: "Tüm hesaplar", options: f.accountOptions.map((a) => [a.id, a.name]) });
  if (f.campaignOptions.length) selects.push({ name: "kampanya", label: source === "ikas" || source === "ga4" ? "Kampanya (UTM / GA4)" : "Kampanya", value: f.campaignId, all: "Tüm kampanyalar", options: f.campaignOptions.map((c) => [c.id, c.name]) });
  const tOpts = f.ga4?.trafficOptions ?? f.ikas?.trafficOptions ?? [];
  if (tOpts.length) selects.push({ name: "trafik", label: "Trafik kaynağı", value: traffic, all: "Tüm kaynaklar", options: tOpts.map((t) => [t, t]) });

  return (
    <>
      <AdShell tab="huni" title="Reklam Hunisi" desc={`${range.label} (${range.from} – ${range.to}) · önceki dönem: ${f.prevRange.from} – ${f.prevRange.to}`}
        platform={platform} conn={conn} range={range} siteId={siteId} switchBase="/reklam/huni" />
      <div className="mb-3 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1" aria-label="Veri kaynağı">
        {FUNNEL_SOURCES.map(([k, label]) => (
          <Link key={k} href={adLink("/reklam/huni", range, siteId, {}, { platform, kaynak: k === platform ? null : k })} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${k === source ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{label}</Link>
        ))}
      </div>
      <AdFilters base="/reklam/huni" range={range} sites={f.sites} siteId={siteId} extra={extra} selects={selects}
        exportHref={adLink("/api/reklam/disa-aktar", range, siteId, { rapor: "huni" }, extra)} />
      <p className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">{SOURCE_NOTE[source]} Kaynaklar birbirine eklenmez; her mod ayrı bir zincirdir.</p>
      {(f.kind === "meta" || f.kind === "google") && <CoverageNote coverage={f.coverage} />}
      {f.kind === "ga4" && !f.ga4?.linked && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Bu filtrede GA4 mülkü bağlı site yok.</p>}
      {f.demo && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800"><b>DEMO</b> · Bu kaynaktaki veriler demo bağlantısından gelir ve sentetiktir.</p>}
      {f.mixedCurrency && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Farklı para birimleri var; tutarlar dönüştürülmeden toplanmıştır.</p>}

      {f.kind === "ikas" ? <Ikas f={f} fmtN={fmtN} money={money} fmtP={fmtP} /> : (
        <>
          <Chain title={source === "google" ? "Google Ads" : source === "meta" ? "Meta" : "GA4 web sitesi"} stages={f.stages} fmtN={fmtN} fmtP={fmtP} />
          {f.kind === "google" && !f.ga4Linked && <p className="mt-3 text-sm text-gray-500">Bu filtrede GA4 mülkü bağlı site yok; site oturumu ve sonraki aşamalar Google Ads için gösterilemez.</p>}
          {f.segments.map((s) => (
            <div key={s.title} className="mt-5">
              <Chain title={s.title} stages={s.stages} fmtN={fmtN} fmtP={fmtP} />
              <p className="mt-2 text-xs text-gray-500">{s.note}</p>
            </div>
          ))}
          {f.kind === "ga4" && f.ga4 && (
            <>
              {f.ga4.empty && <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">GA4 bağlı ama huni (kampanya kırılımlı) verisi henüz senkronlanmadı: bir sonraki senkronda dolar. Bu &quot;veri yok&quot;tur, sıfır değildir.</p>}
              {f.ga4.errors.map((e) => <p key={e} className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{e}</p>)}
              <Table title="Kaynak / ortam (GA4)" rows={f.ga4.bySource} money={money} fmtN={fmtN} fmtP={fmtP} />
              <Table title="Kampanyaya göre (GA4 sessionCampaignName)" rows={f.ga4.byCampaign} money={money} fmtN={fmtN} fmtP={fmtP} />
            </>
          )}
          {f.byCampaign.length > 0 && (
            <div className="card mt-5 overflow-x-auto p-0">
              <h2 className="px-4 pt-4 text-sm font-semibold">Kampanyaya göre ({source === "meta" ? "Meta" : "Google Ads"})</h2>
              <table className="mt-2 w-full min-w-[560px] text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr>
                  <th className="px-4 py-2">Kampanya</th><th className="px-4 py-2 text-right">Harcama</th>
                  <th className="px-4 py-2 text-right">{source === "meta" ? "Açılış sayfası" : "Tıklama"}</th>
                  {source === "meta" && <th className="px-4 py-2 text-right">Sepete ekleme</th>}
                  <th className="px-4 py-2 text-right">{source === "meta" ? "Satın alma" : "Dönüşüm"}</th><th className="px-4 py-2 text-right">Dönüşüm oranı</th>
                </tr></thead>
                <tbody>{f.byCampaign.map((c) => (
                  <tr key={c.name} className="border-t border-gray-100">
                    <td className="px-4 py-2">{c.name}</td><td className="px-4 py-2 text-right">{money(c.spend)}</td><td className="px-4 py-2 text-right">{fmtN(c.visits)}</td>
                    {source === "meta" && <td className="px-4 py-2 text-right">{fmtN(c.carts, 1)}</td>}
                    <td className="px-4 py-2 text-right">{fmtN(c.purchases, 1)}</td><td className="px-4 py-2 text-right">{fmtP(c.convRate)}</td>
                  </tr>
                ))}</tbody>
              </table>
              <p className="px-4 pb-3 pt-2 text-xs text-gray-500">Dönüşüm oranı = {source === "meta" ? "satın alma / açılış sayfası görüntüleme" : "dönüşüm / tıklama"} (aynı kaynak, toplamlardan).</p>
            </div>
          )}
        </>
      )}

      <div className="card mt-5">
        <h2 className="text-sm font-semibold">Yorumlar</h2>
        {f.insights.length
          ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">{f.insights.map((x) => <li key={x}>{x}</li>)}</ul>
          : <p className="mt-2 text-sm text-gray-500">Yorum için yeterli veri yok (bir aşamanın yorumlanması için önceki aşamada en az {MIN_BASE} kayıt gerekir).</p>}
        <p className="mt-2 text-xs text-gray-400">Kural tabanlıdır; yalnızca seçili kaynağın kendi verisinden üretilir.</p>
      </div>
    </>
  );
}

type Fmt = { fmtN: (v: number | null, d?: number) => string; fmtP: (v: number | null) => string };
function Chain({ title, stages, fmtN, fmtP }: { title: string; stages: StageRow[] } & Fmt) {
  const top = Math.max(...stages.map((s) => s.value ?? 0), 1);
  return (
    <div className="card">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ol className="mt-3 space-y-3">
        {stages.map((s, i) => (
          <li key={s.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-medium">{s.label}{s.note && <span className="ml-1 text-xs font-normal text-gray-400">({s.note})</span>}</span>
              <span className="font-semibold tabular-nums">{fmtN(s.value, 1)}</span>
            </div>
            <div className="mt-1 h-3 rounded bg-gray-100"><div className="h-3 rounded bg-indigo-500" style={{ width: `${s.value === null ? 0 : Math.max(1, (s.value / top) * 100)}%` }} /></div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500">
              {i > 0 && <span>Dönüşüm: {fmtP(s.rate)}</span>}
              {i > 0 && <span>Kayıp: {fmtP(s.drop)}</span>}
              <span>Önceki dönem: {fmtN(s.prev, 1)}{s.change !== null && ` (${s.change >= 0 ? "+" : ""}${fmtP(s.change)})`}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Table({ title, rows, money, fmtN, fmtP }: { title: string; rows: { name: string; sessions: number; itemViews: number; carts: number; checkouts: number; purchases: number; revenue: number; convRate: number | null }[]; money: (v: number | null) => string } & Fmt) {
  if (!rows.length) return null;
  return (
    <div className="card mt-5 overflow-x-auto p-0">
      <h2 className="px-4 pt-4 text-sm font-semibold">{title}</h2>
      <table className="mt-2 w-full min-w-[720px] text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr>
          <th className="px-4 py-2">Ad</th><th className="px-4 py-2 text-right">Oturum</th><th className="px-4 py-2 text-right">Ürün görüntüleme</th><th className="px-4 py-2 text-right">Sepet</th>
          <th className="px-4 py-2 text-right">Ödeme</th><th className="px-4 py-2 text-right">Satın alma</th><th className="px-4 py-2 text-right">Oturum→satın alma</th><th className="px-4 py-2 text-right">Gelir (GA4)</th>
        </tr></thead>
        <tbody>{rows.slice(0, 50).map((r) => (
          <tr key={r.name} className="border-t border-gray-100">
            <td className="px-4 py-2">{r.name}</td><td className="px-4 py-2 text-right">{fmtN(r.sessions)}</td><td className="px-4 py-2 text-right">{fmtN(r.itemViews)}</td><td className="px-4 py-2 text-right">{fmtN(r.carts)}</td>
            <td className="px-4 py-2 text-right">{fmtN(r.checkouts)}</td><td className="px-4 py-2 text-right">{fmtN(r.purchases)}</td><td className="px-4 py-2 text-right">{fmtP(r.convRate)}</td><td className="px-4 py-2 text-right">{money(r.revenue)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="px-4 pb-3 pt-2 text-xs text-gray-500">Sepet terk = 1 − ödeme / sepet; ödeme terk = 1 − satın alma / ödeme (satır bazında hesaplanabilir). Gelir GA4 purchaseRevenue&apos;dur, ikas cirosu değildir.</p>
    </div>
  );
}

type IkasF = Extract<Awaited<ReturnType<typeof buildFunnel>>, { kind: "ikas" }>;
function Ikas({ f, fmtN, money, fmtP }: { f: IkasF; money: (v: number | null) => string } & Fmt) {
  const k = f.ikas;
  if (!k.stores) return <p className="card text-sm text-gray-500">Bu filtrede ikas mağazası bağlı site yok.</p>;
  const ch = (a: number, b: number) => (b ? ` (${a >= b ? "+" : ""}${fmtP(((a - b) / b) * 100)})` : "");
  const cards: [string, string, string][] = [
    ["Tüm siparişler", `${fmtN(k.all.orders)} · ${money(k.all.revenue)}`, `Önceki: ${fmtN(k.allPrev.orders)}${ch(k.all.orders, k.allPrev.orders)}`],
    ["UTM'li siparişler", `${fmtN(k.utm.orders)} · ${money(k.utm.revenue)}`, `Önceki: ${fmtN(k.utmPrev.orders)}${ch(k.utm.orders, k.utmPrev.orders)}`],
    ["Eşleşmeyen (UTM'siz)", `${fmtN(k.unmatched.orders)} · ${money(k.unmatched.revenue)}`, `Önceki: ${fmtN(k.unmatchedPrev.orders)}${ch(k.unmatched.orders, k.unmatchedPrev.orders)}`],
    ["Ortalama sepet", money(k.all.aov), `UTM'li: ${money(k.utm.aov)}`],
  ];
  // Bileşen değil, düz yardımcı işlev (render içinde bileşen tanımlanmaz).
  const table = (title: string, rows: typeof k.byCampaign) => (
    <div className="card mt-5 overflow-x-auto p-0">
      <h2 className="px-4 pt-4 text-sm font-semibold">{title}</h2>
      {rows.length ? (
        <table className="mt-2 w-full min-w-[480px] text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Ad</th><th className="px-4 py-2 text-right">Sipariş</th><th className="px-4 py-2 text-right">Gerçek ciro</th><th className="px-4 py-2 text-right">Ort. sepet</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name} className="border-t border-gray-100"><td className="px-4 py-2">{r.name}</td><td className="px-4 py-2 text-right">{fmtN(r.orders)}</td><td className="px-4 py-2 text-right">{money(r.revenue)}</td><td className="px-4 py-2 text-right">{money(r.aov)}</td></tr>)}</tbody>
        </table>
      ) : <p className="px-4 pb-4 pt-2 text-sm text-gray-500">Bu dönemde kayıt yok (0).</p>}
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
        {cards.map(([l, v, s]) => <div key={l} className="card"><p className="text-xs text-gray-500">{l}</p><p className="mt-1 break-words font-semibold">{v}</p><p className="mt-1 text-xs text-gray-400">{s}</p></div>)}
      </div>
      <p className="mt-2 text-xs text-gray-500">ikas&apos;ta oturum, sepet ve ödeme adımı verisi yoktur; bu mod yalnızca siparişleri gösterir. UTM, siparişin geldiği bağlantıdaki etikettir.</p>
      {table("UTM kampanyasına göre", k.byCampaign)}
      {table("Kaynağa göre gerçek ciro (utm_source / utm_medium)", k.bySource)}
    </>
  );
}
