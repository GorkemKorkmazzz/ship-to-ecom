import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { PRODUCT_SORTS, PRODUCT_STATUS, buildProductReport, type ProductReport } from "@/lib/ads/products";
import { parseAdRange } from "@/lib/ads/report";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../thumb";
import { AdShell, PLATFORM_NAME } from "../ad-shell";
import { AdFilters, CoverageNote, adLink } from "../filters";

type SP = { site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string; kampanya?: string; kategori?: string; q?: string; sku?: string; durum?: string; sirala?: string };
const STATUS_TONE: Record<string, string> = { iyi: "bg-emerald-50 text-emerald-700", dusuk: "bg-red-50 text-red-700", satissiz: "bg-amber-50 text-amber-800", yetersiz: "bg-gray-100 text-gray-600", reklamsiz: "bg-gray-100 text-gray-500" };
const change = (now: number | null, prev: number | null) => (now === null || prev === null || !prev ? null : ((now - prev) / prev) * 100);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [platform, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const r = await buildProductReport(user.id, range, { siteId: sp.site, platform, campaignId: sp.kampanya, category: sp.kategori, q: sp.q, sku: sp.sku, status: sp.durum, sort: sp.sirala });
  const siteId = r.site?.id ?? null;
  const conv = platform === "google";
  const extra = { platform, kampanya: r.campaignId, kategori: r.applied.category, q: r.applied.q, sku: r.applied.sku, durum: r.applied.status, sirala: r.applied.sort === "spend" ? null : r.applied.sort };
  const fmtN = (v: number | null, d = 0) => (v === null ? "Veri yok" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v));
  const money = (v: number | null) => (v === null ? "Veri yok" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: r.currency }).format(v));
  const ratio = (v: number | null, d = 2) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v));
  const pctF = (v: number | null) => (v === null ? "—" : `%${ratio(v)}`);
  const NS = <span className="text-xs text-gray-400" title="Bu platform ürün başına bu ölçüyü sağlamıyor">Desteklenmiyor</span>;
  const NA = <span className="text-xs text-gray-400" title="Ürün düzeyi GA4 olayları senkronlanmıyor">Veri yok</span>;
  const k = r.kpi;
  const kpis: { label: string; value: string; delta: number | null; invert?: boolean; src: string; d: string; tone: string }[] = [
    { label: "Toplam reklam harcaması", value: money(k.spend), delta: change(k.spend, k.prevSpend), invert: true, src: `${PLATFORM_NAME[platform]} kampanya düzeyi toplamı`, d: "M3 7h18v12H3zM3 11h18M16 15h2", tone: "bg-indigo-50 text-indigo-600" },
    { label: "Reklam kaynaklı satış adedi", value: fmtN(k.qty), delta: change(k.qty, k.prevQty), src: "ikas siparişleri · UTM kaynağı bu platform", d: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01", tone: "bg-sky-50 text-sky-600" },
    { label: "Reklam kaynaklı ürün cirosu", value: money(k.revenue), delta: change(k.revenue, k.prevRevenue), src: "ikas gerçek satış · UTM eşleşmesi", d: "M3 17l6-6 4 4 8-8M15 7h6v6", tone: "bg-emerald-50 text-emerald-600" },
    { label: "Ortalama ROAS", value: conv ? ratio(k.roas) : "Desteklenmiyor", delta: conv ? change(k.roas, k.prevRoas) : null, src: conv ? "Google ürün dönüşüm değeri / ürün harcaması" : "Meta ürün başına dönüşüm değeri vermez", d: "M4 20V10M10 20V4M16 20v-8M22 20H2", tone: "bg-violet-50 text-violet-600" },
    { label: "Satılan ürün sayısı", value: fmtN(k.sold), delta: change(k.sold, k.prevSold), src: "UTM'li siparişte en az 1 adet satılan ürün", d: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10", tone: "bg-amber-50 text-amber-600" },
    { label: "Harcama başına gelir", value: ratio(k.revPerSpend), delta: change(k.revPerSpend, k.prevRevPerSpend), src: "ikas UTM cirosu / platform toplam harcaması (iki kaynak; ROAS değildir)", d: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6", tone: "bg-pink-50 text-pink-600" },
  ];
  const groups: [keyof ProductReport["groups"], string, (x: ProductReport["rows"][number]) => string][] = [
    ["revenue", "En çok gelir getiren", (x) => money(x.revenue)], ["roas", "En yüksek ROAS", (x) => ratio(x.roas)], ["qty", "En çok satılan", (x) => `${fmtN(x.qty)} adet`],
    ["spend", "En yüksek harcama", (x) => money(x.spend)], ["nosale", "Harcama var, satış yok", (x) => money(x.spend)], ["low", "Düşük performanslı", (x) => `ROAS ${ratio(x.roas)}`],
  ];
  const t = r.thresholds;
  const top = r.rows.filter((x) => (x.spend ?? 0) > 0 || x.revenue > 0).slice(0, 10);
  const maxSR = Math.max(1, ...top.map((x) => Math.max(x.spend ?? 0, x.revenue)));
  const roasRows = r.rows.filter((x) => x.eligible && x.roas !== null).sort((a, b) => b.roas! - a.roas!).slice(0, 10);
  const maxRoas = Math.max(1, ...roasRows.map((x) => x.roas!));
  const detail = (key: string) => adLink(`/reklam/urun-analizi/${encodeURIComponent(key)}`, range, siteId, { platform });

  return (
    <>
      <AdShell tab="urun" title="Ürün Bazlı Analiz" desc={`${r.site ? r.site.name : "Tüm mağazalar"} · ${range.label} (${range.from} – ${range.to}) · karşılaştırma: ${r.prevRange.from} – ${r.prevRange.to}`}
        platform={platform} conn={conn} range={range} siteId={siteId} switchBase="/reklam/urun-analizi" keep={{ kategori: r.applied.category, q: r.applied.q, sku: r.applied.sku, sirala: extra.sirala }} />
      <AdFilters base="/reklam/urun-analizi" range={range} sites={r.sites} siteId={siteId} extra={extra} campaigns={r.campaignOptions} campaignId={r.campaignId}
        exportHref={adLink("/api/reklam/disa-aktar", range, siteId, { rapor: "urunler" }, extra)}
        selects={[
          { name: "kategori", label: "Ürün kategorisi", value: r.applied.category, all: "Tüm kategoriler", options: r.categories.map((c) => [c, c]) },
          { name: "durum", label: "Performans durumu", value: r.applied.status, all: "Tümü", options: Object.entries(PRODUCT_STATUS) },
          { name: "sirala", label: "Sıralama", value: r.applied.sort, options: Object.entries(PRODUCT_SORTS) },
        ]}
        inputs={[{ name: "q", label: "Ürün adı", value: r.applied.q }, { name: "sku", label: "SKU / barkod", value: r.applied.sku }]} />
      <CoverageNote coverage={r.coverage} />
      {r.accounts > 0 && !r.productSynced && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Ürün düzeyi reklam verisi henüz senkronlanmadı: ürün harcaması, gösterim ve tıklama &quot;Veri yok&quot; görünür (sıfır değildir). Bir sonraki senkronda dolar.</p>}
      {r.productErrors.map((e) => <p key={e} className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">Ürün düzeyi senkron hatası · {e}</p>)}
      {r.mixedCurrency && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Farklı para birimleri var; tutarlar dönüştürülmeden toplanmıştır.</p>}
      <p className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">
        <b>İki ayrı kaynak:</b> harcama, gösterim ve tıklama {PLATFORM_NAME[platform]}&apos;in ürün kırılımından{conv ? " (shopping_performance_view: Shopping ve Performance Max)" : " (insights product_id kırılımı)"}; satış adedi ve ciro ikas siparişlerinden (UTM kaynağı {PLATFORM_NAME[platform]} olan siparişler, son tıklama). Kampanya harcaması ürünlere dağıtılmaz; ürün kırılımı olmayan harcama hiçbir ürüne yazılmaz.
        {!conv && " Meta, site dışı dönüşümlerde ürün kırılımı vermediği için ürün başına platform dönüşümü ve ROAS (platform) desteklenmez; ROAS sütunu ikas UTM cirosu / ürün harcamasıdır."}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        {kpis.map((x) => {
          const good = x.delta === null ? null : x.invert ? x.delta <= 0 : x.delta >= 0;
          return (
            <div key={x.label} className="card p-4" title={x.src}>
              <div className="flex items-center gap-2"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${x.tone}`}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={x.d} /></svg></span><span className="text-sm leading-tight text-gray-500">{x.label}</span></div>
              <div className="mt-2 truncate text-xl font-bold tabular-nums">{x.value}</div>
              <div className="mt-1.5">{x.delta === null ? <span className="text-xs text-gray-400">önceki dönem yok</span> : <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{x.delta >= 0 ? "↗" : "↘"} %{ratio(Math.abs(x.delta), 1)}</span>}</div>
              <div className="mt-1.5 text-[11px] leading-snug text-gray-400">{x.src}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="card">
          <h2 className="font-semibold">Harcama ve ciro (ilk 10 ürün)</h2>
          <p className="text-xs text-gray-500">Mor: ürün reklam harcaması ({PLATFORM_NAME[platform]}) · Yeşil: ikas UTM cirosu. Aynı ölçekte; farklı kaynaklar.</p>
          {top.length ? (
            <ul className="mt-3 space-y-2.5">
              {top.map((x) => (
                <li key={x.key}>
                  <Link href={detail(x.key)} className="block truncate text-sm font-medium hover:text-indigo-700" title={x.name}>{x.name}</Link>
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center gap-2"><div className="h-2 rounded bg-indigo-500" style={{ width: `${Math.max(0.5, ((x.spend ?? 0) / maxSR) * 100)}%` }} /><span className="shrink-0 text-xs tabular-nums text-gray-600">{money(x.spend)}</span></div>
                    <div className="flex items-center gap-2"><div className="h-2 rounded bg-emerald-500" style={{ width: `${Math.max(0.5, (x.revenue / maxSR) * 100)}%` }} /><span className="shrink-0 text-xs tabular-nums text-gray-600">{money(x.revenue)}</span></div>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-gray-500">Bu filtrede harcama ya da satış olan ürün yok.</p>}
        </section>
        <section className="card">
          <h2 className="font-semibold">ROAS karşılaştırması</h2>
          <p className="text-xs text-gray-500">Yalnızca yeterli veriye sahip ürünler. {conv ? "Google ürün dönüşüm değeri / ürün harcaması." : "ikas UTM cirosu / Meta ürün harcaması."}{t.avgRoas !== null && ` Ortalama: ${ratio(t.avgRoas)}.`}</p>
          {roasRows.length ? (
            <ul className="mt-3 space-y-2">
              {roasRows.map((x) => (
                <li key={x.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] items-center gap-2 text-sm">
                  <Link href={detail(x.key)} className="truncate hover:text-indigo-700" title={x.name}>{x.name}</Link>
                  <div className="flex items-center gap-2"><div className={`h-2.5 rounded ${t.avgRoas !== null && x.roas! >= t.avgRoas ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.max(1, (x.roas! / maxRoas) * 100)}%` }} /><span className="shrink-0 text-xs font-semibold tabular-nums">{ratio(x.roas)}</span></div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-gray-500">Karşılaştırma için yeterli veriye sahip ürün yok.</p>}
        </section>
      </div>

      <section className="card mt-5">
        <h2 className="font-semibold">Performans sınıfları</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Eşikler bu dönemin verisinden türetilir (başarı ölçüsü: {t.basis}). Yeterli veri: en az {t.minClicks === null ? "—" : fmtN(t.minClicks)} tıklama (ortalama dönüşüm oranı {pctF(t.avgCvr)} ile ≥3 başarı beklenir) ya da en az {money(t.minSpend)} harcama (3 × ortalama CPA {money(t.avgCpa)}).
          Satış yok: yeterli veri var, başarı 0. Düşük: ROAS ortalamanın yarısından az. Yüksek: ROAS ortalamanın üstünde. Yeterli verisi olmayan ürün başarısız sayılmaz.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(([g, label, f]) => (
            <div key={g} className="rounded-xl border border-gray-200 p-3">
              <h3 className="text-sm font-semibold">{label}</h3>
              {r.groups[g].length ? (
                <ol className="mt-2 space-y-1.5">{r.groups[g].map((x) => <li key={x.key} className="flex items-center justify-between gap-2 text-sm"><Link href={detail(x.key)} className="min-w-0 truncate hover:text-indigo-700" title={x.name}>{x.name}</Link><span className="shrink-0 tabular-nums text-gray-600">{f(x)}</span></li>)}</ol>
              ) : <p className="mt-2 text-xs text-gray-400">Bu sınıfta ürün yok ya da yeterli veri yok.</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-5 overflow-x-auto p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
          <h2 className="font-semibold">Ürün performansı ({r.rows.length})</h2>
          <span className="text-xs text-gray-500">{r.attributedOrders} UTM siparişi · {r.stores} mağaza</span>
        </div>
        <table className="mt-3 w-full min-w-[1400px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>{["Ürün", "SKU / barkod", "Platform", "Harcama", "Gösterim", "Tıklama", "Ürün görüntüleme", "Sepete ekleme", conv ? "Platform dönüşümü" : "Platform dönüşümü", "Sipariş (ikas)", "Adet (ikas)", "Ciro (ikas)", "ROAS", "CPA", "CTR", "Dönüşüm oranı", "Durum"].map((h, i) => <th key={h + i} className={`px-3 py-2 font-medium ${i > 2 && i < 16 ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {r.rows.map((x) => (
              <tr key={x.key} className="hover:bg-gray-50">
                <td className="px-3 py-2"><Link href={detail(x.key)} className="flex items-center gap-2.5 font-medium hover:text-indigo-700"><Thumb src={x.image} alt={x.name} size={36} /><span className="max-w-[220px] truncate" title={x.name}>{x.name}</span></Link>{x.matchedBy.length > 0 && <div className="mt-0.5 pl-[46px] text-[11px] text-gray-400">Eşleşme: {x.matchedBy.join(", ")}</div>}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{x.sku ?? "—"}{x.barcode && <div className="text-gray-400">{x.barcode}</div>}</td>
                <td className="px-3 py-2 text-xs">{PLATFORM_NAME[platform]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(x.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(x.impressions)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(x.clicks)}</td>
                <td className="px-3 py-2 text-right">{NA}</td>
                <td className="px-3 py-2 text-right">{NA}</td>
                <td className="px-3 py-2 text-right tabular-nums">{conv ? fmtN(x.conversions, 1) : NS}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(x.orders)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(x.qty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(x.revenue)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{ratio(x.roas)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{x.cpa === null ? "—" : money(x.cpa)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pctF(x.ctr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{conv ? pctF(x.convRate) : NS}</td>
                <td className="px-3 py-2"><span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[x.status]}`}>{PRODUCT_STATUS[x.status]}</span></td>
              </tr>
            ))}
            {!r.rows.length && <tr><td colSpan={17} className="px-5 py-8 text-center text-gray-500">Bu filtrede ürün yok.</td></tr>}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs leading-relaxed text-gray-500">
          ROAS = {conv ? "Google ürün dönüşüm değeri / ürün harcaması (platform kaynağı)" : "ikas UTM cirosu / Meta ürün harcaması"}. CPA = ürün harcaması / {conv ? "Google ürün dönüşümü" : "ikas UTM siparişi"}. CTR = tıklama / gösterim{conv ? "; dönüşüm oranı = platform dönüşümü / tıklama" : ""}.
          Ürün görüntüleme ve sepete ekleme ürün düzeyinde senkronlanmadığı için &quot;Veri yok&quot;tur. Bir ürün birden çok kampanya ya da varyant anahtarında görünüyorsa platform satırları toplanır (platform her gösterimi kendi satırında bir kez raporlar); ikas siparişi tek UTM kaynağına sahip olduğundan bir kez sayılır.
          {r.unmatchedSales.lines > 0 && ` Katalogda SKU karşılığı bulunmayan ${r.unmatchedSales.lines} sipariş satırı (${money(r.unmatchedSales.revenue)}) hiçbir ürüne yazılmadı.`}
        </p>
      </section>

      <section className="card mt-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Eşleşmeyen reklam ürünleri ({r.unmatched.length})</h2>
        <p className="px-5 text-xs text-gray-500">Platformun ürün anahtarı katalogdaki ürün kimliği, varyant kimliği, SKU veya barkodla birebir eşleşmedi. Bu harcama hiçbir ürüne atfedilmez.</p>
        {r.unmatched.length ? (
          <table className="mt-3 w-full min-w-[760px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Platform ürün anahtarı</th><th className="px-3 py-2">Neden</th><th className="px-3 py-2">Olası ürün (ad)</th><th className="px-3 py-2 text-right">Kampanya</th><th className="px-3 py-2 text-right">Harcama</th><th className="px-3 py-2 text-right">Tıklama</th></tr></thead>
            <tbody className="divide-y divide-gray-100">{r.unmatched.map((u) => (
              <tr key={u.key}><td className="px-3 py-2"><code className="text-xs">{u.key}</code>{u.title && <div className="text-xs text-gray-500">{u.title}</div>}</td><td className="px-3 py-2 text-xs text-gray-600">{u.reason}</td><td className="px-3 py-2 text-xs">{u.candidate ?? "—"}</td><td className="px-3 py-2 text-right">{u.campaigns}</td><td className="px-3 py-2 text-right tabular-nums">{money(u.ad.spend)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtN(u.ad.clicks)}</td></tr>
            ))}</tbody>
          </table>
        ) : <p className="px-5 pb-4 pt-2 text-sm text-gray-500">Eşleşmeyen ürün yok.</p>}
      </section>
    </>
  );
}
