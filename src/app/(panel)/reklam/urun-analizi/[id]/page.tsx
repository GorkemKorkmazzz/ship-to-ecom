import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { buildProductDetail } from "@/lib/ads/products";
import { parseAdRange } from "@/lib/ads/report";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../../thumb";
import { AdShell, PLATFORM_NAME } from "../../ad-shell";
import { AdFilters, adLink } from "../../filters";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gun?: string; baslangic?: string; bitis?: string; platform?: string; site?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const { id } = await params;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [platform, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const d = await buildProductDetail(user.id, decodeURIComponent(id), range, platform);
  if (!d) notFound(); // başka kullanıcının ürünü görünmez
  const p = d.product, a = d.ad, conv = d.conv;
  const fmtN = (v: number | null | undefined, dg = 0) => (v === null || v === undefined ? "Veri yok" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg }).format(v));
  const money = (v: number | null | undefined) => (v === null || v === undefined ? "Veri yok" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: d.currency }).format(v));
  const ratio = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v));
  const noAd = !a ? (d.productSynced ? 0 : null) : undefined;
  const back = adLink("/reklam/urun-analizi", range, sp.site ?? null, { platform });
  const box = (title: string, rows: [string, string, string?][], note?: string) => (
    <section className="card">
      <h2 className="font-semibold">{title}</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{rows.map(([k, v, h]) => <div key={k} className="contents"><dt className="text-gray-500" title={h}>{k}</dt><dd className="text-right font-semibold tabular-nums">{v}</dd></div>)}</dl>
      {note && <p className="mt-3 text-xs text-gray-500">{note}</p>}
    </section>
  );

  return (
    <>
      <AdShell tab="urun" title={p.name} desc={`${p.storeName} · ${range.label} (${range.from} – ${range.to}) · karşılaştırma: ${d.prevRange.from} – ${d.prevRange.to}`}
        platform={platform} conn={conn} range={range} siteId={null} switchBase={`/reklam/urun-analizi/${encodeURIComponent(p.key)}`}>
        <Link href={back} className="btn-ghost">← Ürünler</Link>
      </AdShell>
      <AdFilters base={`/reklam/urun-analizi/${encodeURIComponent(p.key)}`} range={range} sites={[]} siteId={null} extra={{ platform }} />

      <div className="grid gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <section className="card flex gap-4">
          <Thumb src={p.image} alt={p.name} size={96} />
          <div className="min-w-0 text-sm">
            <h2 className="font-semibold">Ürün bilgileri</h2>
            <p className="mt-1 break-words text-gray-700">{p.name}</p>
            <p className="mt-1 text-gray-500">SKU: {p.skus.join(", ") || "—"}</p>
            {p.barcodes.length > 0 && <p className="text-gray-500">Barkod: {p.barcodes.join(", ")}</p>}
            <p className="mt-1">Güncel fiyat: <b>{p.price === null ? "Veri yok" : money(p.price)}</b></p>
            <p>Stok: <b>{fmtN(p.stock)}</b> <span className="text-xs text-gray-400">(ikas varyant stokları toplamı)</span></p>
            {p.category && <p className="text-gray-500">Kategori: {p.category}</p>}
            <p className="mt-1 text-xs text-gray-400">Reklam eşleşmesi: {d.matchedBy.length ? d.matchedBy.join(", ") : "bu dönemde yok"}</p>
          </div>
        </section>
        {box(`Reklam performansı · ${PLATFORM_NAME[platform]}`, [
          ["Reklam harcaması", money(a?.spend ?? noAd)], ["Gösterim", fmtN(a?.impressions ?? noAd)], ["Tıklama", fmtN(a?.clicks ?? noAd)],
          ["Dönüşüm (platform)", conv ? fmtN(a?.conversions ?? noAd, 1) : "Desteklenmiyor"], ["ROAS", ratio(d.roas), conv ? "Google ürün dönüşüm değeri / harcama" : "ikas UTM cirosu / Meta ürün harcaması"],
          ["CPA", d.cpa === null ? "—" : money(d.cpa)], ["Önceki dönem harcama", money(d.prevAd?.spend ?? noAd)],
        ], conv ? "Kaynak: Google Ads shopping_performance_view (ürün kırılımı). Dönüşümler Google'ın atıf modeliyle sayılır; ikas siparişi değildir." : "Kaynak: Meta insights product_id kırılımı. Meta ürün başına site dönüşümü vermez.")}
        {box("Satış performansı · ikas", [
          ["Sipariş sayısı", fmtN(d.sales.orders)], ["Satılan adet", fmtN(d.sales.qty)], ["Toplam ciro", money(d.sales.revenue)], ["Ortalama satış fiyatı", d.sales.avgPrice === null ? "—" : money(d.sales.avgPrice)],
          ["Önceki dönem ciro", money(d.prevSales.revenue)], ["Önceki dönem adet", fmtN(d.prevSales.qty)],
        ], `Yalnızca UTM kaynağı ${PLATFORM_NAME[platform]} (ücretli ortam) olan, iptal/taslak olmayan siparişler; ürün SKU ile bağlanır.`)}
      </div>

      <section className="card mt-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Kampanya dağılımı</h2>
        <p className="px-5 text-xs text-gray-500">Platform sütunları ürün kırılımından gelir. ikas sütunları, utm_campaign değeri kampanya adıyla birebir aynı olan siparişlerdir (ad eşleşmesi; kampanya adı UTM&apos;de farklı yazılmışsa görünmez).</p>
        <table className="mt-3 w-full min-w-[820px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr>{["Kampanya", "Platform", "Harcama", "Tıklama", "Dönüşüm (platform)", "Dönüşüm değeri (platform)", "ROAS (platform)", "Ciro (ikas UTM)"].map((h, i) => <th key={h} className={`px-3 py-2 ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {d.campaigns.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2"><Link href={adLink(`/reklam/kampanyalar/${c.id}`, range, null)} className="font-medium hover:text-indigo-700">{c.name}</Link></td>
                <td className="px-3 py-2 text-xs">{PLATFORM_NAME[platform]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(c.spend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtN(c.clicks)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{conv ? fmtN(c.conversions, 1) : "Desteklenmiyor"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{conv ? money(c.value) : "Desteklenmiyor"}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{conv ? ratio(c.platformRoas) : "Desteklenmiyor"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(c.utmRevenue)}{c.utmOrders > 0 && <span className="text-xs text-gray-400"> · {c.utmOrders} sipariş</span>}</td>
              </tr>
            ))}
            {!d.campaigns.length && <tr><td colSpan={8} className="px-5 py-6 text-center text-gray-500">Bu dönemde bu ürün için platform ürün kırılımında kampanya yok.</td></tr>}
          </tbody>
        </table>
        {d.utmOnly.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 text-xs text-gray-600">
            <b>Platform ürün kırılımında görünmeyen UTM kampanyaları (ikas):</b> {d.utmOnly.map((u) => `${u.name}: ${u.orders} sipariş, ${fmtN(u.qty)} adet, ${money(u.revenue)}`).join(" · ")}
          </div>
        )}
      </section>
    </>
  );
}
