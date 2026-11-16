import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { buildAdReport, buildCampaignReport, parseAdRange } from "@/lib/ads/report";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdShell } from "../ad-shell";
import { AdFilters, AdSourceNote, CoverageNote, adLink } from "../filters";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };
const COLS = [["name", "Kampanya"], ["spend", "Harcama"], ["clicks", "Tıklama"], ["ctr", "CTR"], ["cpc", "CPC"], ["purchases", "Dönüşüm"], ["value", "Dönüşüm değeri"], ["roas", "ROAS"]] as const;

type SP = { site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string; durum?: string; q?: string; sirala?: string; yon?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const r = await buildAdReport(user.id, range, sp.site);
  const siteId = r.site?.id ?? null;
  const [provider, conn] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id)]);
  const c = await buildCampaignReport(user.id, range, siteId, { provider, status: sp.durum, q: sp.q, sort: sp.sirala, dir: sp.yon });
  const extra = { platform: provider, durum: sp.durum || null, q: sp.q || null, sirala: sp.sirala || null, yon: sp.yon || null };
  const link = (patch: Record<string, string | null>) => adLink("/reklam/kampanyalar", range, siteId, patch, extra);
  const fmtN = (v: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  const money = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: r.currency }).format(v));
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  const delta = (now: number | null, prev: number | null | undefined) => (now === null || !prev ? null : ((now - prev) / prev) * 100);

  return (
    <>
      <AdShell tab="kampanya" title="Kampanya Detayı" desc={`${r.site ? r.site.name : "Tüm mağazalar"} · ${range.label} (${range.from} – ${range.to}) · ${c.rows.length} kampanya · değişim: ${c.prevRange.from} – ${c.prevRange.to} ile`}
        platform={provider} conn={conn} range={range} siteId={siteId} switchBase="/reklam/kampanyalar" keep={{ durum: sp.durum || null }} />
      <AdFilters base="/reklam/kampanyalar" range={range} sites={r.sites} siteId={siteId} extra={extra}
        exportHref={adLink("/api/reklam/disa-aktar", range, siteId, { rapor: "kampanyalar" }, extra)} />
      {r.accounts.length > 0 && <CoverageNote coverage={r.coverage} />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ platform: null })} className={pill(!provider)}>Tüm platformlar</Link>
          <Link href={link({ platform: "meta" })} className={pill(provider === "meta")}>Meta</Link>
          <Link href={link({ platform: "google" })} className={pill(provider === "google")}>Google Ads</Link>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          {Object.entries({ site: siteId, gun: range.preset ?? null, baslangic: range.preset ? null : range.from, bitis: range.preset ? null : range.to, platform: provider, sirala: sp.sirala || null, yon: sp.yon || null }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <label className="block">
            <span className="label">Durum</span>
            <select className="input" name="durum" defaultValue={sp.durum ?? ""}>
              <option value="">Tümü</option>
              {c.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Ara</span><input className="input" name="q" defaultValue={sp.q ?? ""} placeholder="Kampanya ya da hesap adı" /></label>
          <button className="btn-ghost">Uygula</button>
        </form>
      </div>

      <section className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {COLS.map(([k, label], i) => {
                const active = c.sort === k;
                const next = active && c.dir === "desc" ? "asc" : "desc";
                return (
                  <th key={k} className={`th ${i ? "text-right" : ""}`} aria-sort={active ? (c.dir === "asc" ? "ascending" : "descending") : undefined}>
                    <Link href={link({ sirala: k, yon: next })} className={`hover:text-gray-900 ${active ? "text-indigo-700" : ""}`}>{label}{active ? (c.dir === "asc" ? " ↑" : " ↓") : ""}</Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {c.rows.map((row) => {
              const roasD = delta(row.roas, row.prev?.roas), spendD = delta(row.spend, row.prev?.spend);
              return (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <span className={`badge ${PROVIDER[row.provider]?.[1]}`}>{PROVIDER[row.provider]?.[0]}</span>
                      <Link href={adLink(`/reklam/kampanyalar/${row.id}`, range, null)} className="font-medium hover:text-indigo-700 hover:underline">{row.name}</Link>
                    </div>
                    <div className="text-xs text-gray-500">{row.account}{row.status ? ` · ${row.status}` : ""}{row.objective ? ` · ${row.objective}` : ""}</div>
                  </td>
                  <td className="td text-right tabular-nums">
                    {money(row.spend)}
                    {spendD !== null && <div className={`text-xs ${spendD > 0 ? "text-red-600" : "text-emerald-700"}`}>{spendD >= 0 ? "↗" : "↘"} %{fmtN(Math.abs(spendD), 1)}</div>}
                  </td>
                  <td className="td text-right tabular-nums">{fmtN(row.clicks)}</td>
                  <td className="td text-right tabular-nums">{row.ctr === null ? "—" : `%${fmtN(row.ctr, 2)}`}</td>
                  <td className="td text-right tabular-nums">{money(row.cpc)}</td>
                  <td className="td text-right tabular-nums">{fmtN(row.purchases, 1)}</td>
                  <td className="td text-right tabular-nums">{money(row.value)}</td>
                  <td className="td text-right tabular-nums">
                    <span className="font-semibold">{row.roas === null ? "—" : fmtN(row.roas, 2)}</span>
                    {roasD !== null && <div className={`text-xs ${roasD >= 0 ? "text-emerald-700" : "text-red-600"}`}>{roasD >= 0 ? "↗" : "↘"} %{fmtN(Math.abs(roasD), 1)}</div>}
                  </td>
                </tr>
              );
            })}
            {!c.rows.length && <tr><td className="td py-10 text-center text-gray-500" colSpan={COLS.length}>Bu filtrelerle kampanya verisi yok.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="mt-2 text-xs text-gray-500">Değerler Meta ve Google Ads&apos;in raporladığı değerlerdir. Yalnızca seçili dönemde verisi olan kampanyalar listelenir.</p>
      <AdSourceNote providers={[...new Set(c.rows.map((x) => x.provider))]} demo={r.demo} />
    </>
  );
}
