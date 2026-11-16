import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { buildAdReport, parseAdRange, type Ratios } from "@/lib/ads/report";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdFilters, adLink } from "../reklam/filters";
import { fmtDate } from "../ui";
import { AdShell } from "../reklam/ad-shell";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };

export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [provider, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const r = await buildAdReport(user.id, range, sp.site, { provider });
  const fmtN = (v: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: r.currency }).format(v));
  const pct = (v: number | null) => (v === null ? "—" : `%${fmtN(v, 2)}`);
  const x = (v: number | null) => (v === null ? "—" : fmtN(v, 2));
  const link = (patch: Record<string, string | null>) => adLink("/reklam-raporu", range, r.site?.id ?? null, patch);
  const kpis: [string, string, string?][] = [
    ["Harcama", money(r.total.spend)],
    ["Platform cirosu", money(r.total.value), "Reklam platformlarının raporladığı dönüşüm değeri"],
    ["Satın alma / dönüşüm", fmtN(r.total.purchases, 1)],
    ["ROAS", x(r.total.roas)],
    ["CPC", money(r.total.cpc)],
    ["CTR", pct(r.total.ctr)],
  ];
  // Bileşen değil, düz yardımcı işlev (render içinde bileşen tanımlanmaz).
  const row = (t: Ratios) => (
    <>
      <td className="td text-right tabular-nums">{money(t.spend)}</td>
      <td className="td text-right tabular-nums">{fmtN(t.impressions)}</td>
      <td className="td text-right tabular-nums">{fmtN(t.clicks)}</td>
      <td className="td text-right tabular-nums">{pct(t.ctr)}</td>
      <td className="td text-right tabular-nums">{money(t.cpc)}</td>
      <td className="td text-right tabular-nums">{money(t.cpm)}</td>
      <td className="td text-right tabular-nums">{fmtN(t.purchases, 1)}</td>
      <td className="td text-right tabular-nums">{money(t.value)}</td>
      <td className="td text-right font-semibold tabular-nums">{x(t.roas)}</td>
    </>
  );
  const head = (first: string) => (
    <thead className="border-b border-gray-200 bg-gray-50">
      <tr>{[first, "Harcama", "Gösterim", "Tıklama", "CTR", "CPC", "CPM", "Dönüşüm", "Dönüşüm değeri", "ROAS"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
    </thead>
  );
  const noAccounts = !r.accounts.length;

  return (
    <>
      <AdShell tab="rapor" title="Reklam Raporları" desc={`${r.site ? `${r.site.name} (${r.site.domain})` : "Tüm siteler"} · ${range.from} – ${range.to} · ${provider === "meta" ? "Meta" : "Google Ads"}'in raporladığı değerler`}
        platform={provider} conn={conn} range={range} siteId={r.site?.id ?? null} switchBase="/reklam-raporu">
        <Link href="/reklam-hesaplari" className="btn-ghost">Reklam hesapları</Link>
      </AdShell>

      <AdFilters base="/reklam-raporu" range={range} sites={r.sites} siteId={r.site?.id ?? null} extra={{ platform: provider }} />

      {noAccounts ? (
        <div className="card py-10 text-center text-sm text-gray-600">
          {r.site ? "Bu siteye bağlı ve raporlamaya dahil edilmiş reklam hesabı yok." : "Raporlamaya dahil edilmiş reklam hesabı yok."}{" "}
          <Link href="/reklam-hesaplari" className="font-medium text-indigo-700 hover:underline">Reklam hesaplarını yönet</Link>
        </div>
      ) : (
        <>
          {r.mixedCurrency && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Hesaplar farklı para birimleri kullanıyor; toplamlar dönüştürülmeden toplanır ve {r.currency} olarak gösterilir.</p>}
          {r.shared && !r.site && <p className="mb-4 rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-800">Bazı reklam hesapları birden fazla siteye bağlı: site satırlarında her sitede tam görünür, genel toplamda bir kez sayılır.</p>}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
            {kpis.map(([k, v, hint]) => (
              <div key={k} className="card p-4" title={hint}>
                <div className="truncate text-sm text-gray-500">{k}</div>
                <div className="mt-1 truncate text-xl font-bold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          <section className="card mt-5 overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Platformlar</h2>
            <table className="mt-3 w-full">{head("Platform")}
              <tbody className="divide-y divide-gray-100">
                {r.platforms.filter((p) => p.accounts).map((p) => (
                  <tr key={p.provider}><td className="td"><span className={`badge ${PROVIDER[p.provider][1]}`}>{PROVIDER[p.provider][0]}</span> <span className="text-xs text-gray-500">{p.accounts} hesap</span></td>{row(p)}</tr>
                ))}
              </tbody>
            </table>
          </section>

          {!r.site && (
            <section className="card mt-5 overflow-x-auto p-0">
              <h2 className="px-5 pt-4 font-semibold">Sitelere göre</h2>
              {r.unassigned > 0 && <p className="px-5 text-xs text-amber-700">{r.unassigned} reklam hesabı hiçbir siteye atanmamış; genel toplamda var, site satırlarında yok.</p>}
              <table className="mt-3 w-full">{head("Site")}
                <tbody className="divide-y divide-gray-100">
                  {r.bySite.map((s) => (
                    <tr key={s.id}>
                      <td className="td"><Link href={link({ site: s.id })} className="font-medium hover:text-indigo-700 hover:underline">{s.name}</Link><div className="text-xs text-gray-500">{s.domain} · {s.accounts} hesap</div></td>
                      {row(s)}
                    </tr>
                  ))}
                  {!r.bySite.length && <tr><td className="td py-6 text-center text-gray-500" colSpan={10}>Henüz site yok. <Link href="/siteler" className="text-indigo-700 hover:underline">Site ekleyin</Link></td></tr>}
                </tbody>
              </table>
            </section>
          )}

          <section className="card mt-5 overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Reklam hesaplarına göre</h2>
            <table className="mt-3 w-full">{head("Hesap")}
              <tbody className="divide-y divide-gray-100">
                {r.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="td">
                      <div className="flex items-center gap-2"><span className={`badge ${PROVIDER[a.provider]?.[1]}`}>{PROVIDER[a.provider]?.[0]}</span><span className="font-medium">{a.name}</span></div>
                      <div className="text-xs text-gray-500">{a.externalId} · güncellendi {fmtDate(a.syncedAt)}</div>
                      {(a.broken || a.error) && <div className="mt-1 text-xs text-red-600">{a.broken ? "Bağlantı kesildi; veriler güncellenmiyor." : a.error}</div>}
                    </td>
                    {row(a)}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
