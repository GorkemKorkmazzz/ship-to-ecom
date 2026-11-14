import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCampaignDetail, parseAdRange } from "@/lib/ads/report";
import { requireUser } from "@/lib/session";
import { PageHeader } from "../../../ui";
import { AdChart } from "../../ad-chart";
import { adLink } from "../../filters";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gun?: string; baslangic?: string; bitis?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const { id } = await params;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  // Kampanya kullanıcının bağlantılarından birine ait değilse 404 (başka kullanıcının kampanyası görünmez).
  const d = await buildCampaignDetail(user.id, id, range);
  if (!d) notFound();
  const { campaign: c, total: t } = d;
  const provider = c.adAccount.provider === "google" ? "google" : "meta";
  const cur = c.adAccount.currency ?? "TRY";
  const fmtN = (v: number, dg = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg, minimumFractionDigits: dg }).format(v);
  const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(v));
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  // Grafik bileşeni platform serisi bekler; kampanyanın kendi platformu doldurulur, diğeri sıfırdır.
  const zero = d.days.map(() => 0);
  const own = { spend: d.days.map((x) => x.spend), value: d.days.map((x) => x.value), clicks: d.days.map((x) => x.clicks), impressions: d.days.map((x) => x.impressions), purchases: d.days.map((x) => x.purchases) };
  const blank = { spend: zero, value: zero, clicks: zero, impressions: zero, purchases: zero };
  const series = provider === "google" ? { meta: blank, google: own } : { meta: own, google: blank };
  const kpis: [string, string][] = [
    ["Harcama", money(t.spend)], ["Gösterim", fmtN(t.impressions)], ["Tıklama", fmtN(t.clicks)], ["CTR", t.ctr === null ? "—" : `%${fmtN(t.ctr, 2)}`],
    ["CPC", money(t.cpc)], ["CPM", money(t.cpm)], [provider === "google" ? "Dönüşüm" : "Satın alma", fmtN(t.purchases, 1)], ["Dönüşüm değeri", money(t.value)], ["ROAS", t.roas === null ? "—" : fmtN(t.roas, 2)],
  ];

  return (
    <>
      <PageHeader title={c.name} desc={`${provider === "google" ? "Google Ads" : "Meta"} · ${c.adAccount.name} (${c.adAccount.externalId}) · kampanya ${c.externalId}${c.status ? ` · ${c.status}` : ""}${c.objective ? ` · ${c.objective}` : ""}`}>
        <Link href={adLink("/reklam/kampanyalar", { ...range }, null)} className="btn-ghost">← Kampanyalar</Link>
      </PageHeader>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {[7, 30, 90].map((n) => <Link key={n} href={`/reklam/kampanyalar/${c.id}?gun=${n}`} className={pill(range.preset === n)}>Son {n} gün</Link>)}
        </div>
        <span className="text-sm text-gray-500">{range.from} – {range.to}</span>
        <span className="text-sm text-gray-500">Siteler: {c.adAccount.websites.map((w) => w.website.name).join(", ") || "atanmamış"}</span>
        {!c.adAccount.selected && <span className="badge bg-amber-100 text-amber-800">Hesap raporlamaya dahil değil</span>}
      </div>

      <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 xl:grid-cols-9 [&>*]:min-w-0">
        {kpis.map(([k, v]) => <div key={k} className="card p-3"><div className="truncate text-xs text-gray-500">{k}</div><div className="mt-1 truncate font-bold tabular-nums">{v}</div></div>)}
      </div>

      <section className="card mt-5">
        <h2 className="mb-3 text-lg font-semibold">Günlük performans</h2>
        <AdChart days={d.days.map((x) => x.date)} series={series} currency={cur} providers={[provider]} />
      </section>

      <section className="card mt-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Günlük döküm</h2>
        <table className="mt-3 w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>{["Tarih", "Harcama", "Gösterim", "Tıklama", "CTR", "CPC", "Dönüşüm", "Dönüşüm değeri", "ROAS"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...d.days].reverse().map((x) => (
              <tr key={x.date} className={x.spend || x.impressions ? "" : "text-gray-400"}>
                <td className="td whitespace-nowrap">{x.date}</td>
                <td className="td text-right tabular-nums">{money(x.spend)}</td>
                <td className="td text-right tabular-nums">{fmtN(x.impressions)}</td>
                <td className="td text-right tabular-nums">{fmtN(x.clicks)}</td>
                <td className="td text-right tabular-nums">{x.ctr === null ? "—" : `%${fmtN(x.ctr, 2)}`}</td>
                <td className="td text-right tabular-nums">{money(x.cpc)}</td>
                <td className="td text-right tabular-nums">{fmtN(x.purchases, 1)}</td>
                <td className="td text-right tabular-nums">{money(x.value)}</td>
                <td className="td text-right tabular-nums">{x.roas === null ? "—" : fmtN(x.roas, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
