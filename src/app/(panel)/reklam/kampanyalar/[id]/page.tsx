import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildCampaignAnalysis } from "@/lib/ads/campaign";
import { parseAdRange } from "@/lib/ads/report";
import { adConnections, type AdPlatform } from "@/lib/ads/platform";
import { requireUser } from "@/lib/session";
import { AdShell } from "../../ad-shell";
import { AdFilters, AdSourceNote, CoverageNote, adLink } from "../../filters";
import { MetricChart } from "../../metric-chart";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };
const statusTone = (s: string | null) => (!s ? "bg-gray-100 text-gray-600" : /ACTIVE|ENABLED/.test(s) ? "bg-emerald-100 text-emerald-700" : /PAUSED/.test(s) ? "bg-amber-100 text-amber-800" : /REMOVED|DELETED|ARCHIVED/.test(s) ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600");
const change = (now: number | null, prev: number | null | undefined) => (now === null || prev === null || prev === undefined || prev === 0 ? null : ((now - prev) / prev) * 100);

function Delta({ v, invert = false, prevZero = false }: { v: number | null; invert?: boolean; prevZero?: boolean }) {
  if (v === null) return <span className="text-xs text-gray-400">{prevZero ? "önceki dönem 0" : "karşılaştırma yok"}</span>;
  const good = invert ? v <= 0 : v >= 0;
  return <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{v >= 0 ? "↗" : "↘"} %{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(v))}</span>;
}

type SP = { gun?: string; baslangic?: string; bitis?: string };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const { id } = await params;
  const range = parseAdRange((await searchParams).gun, (await searchParams).baslangic, (await searchParams).bitis);
  const [d, conn] = await Promise.all([buildCampaignAnalysis(user.id, id, range), adConnections(user.id)]);
  if (!d) notFound(); // başka kullanıcının kampanyası görünmez
  const { campaign: c, total: t, prev: p, budget: b } = d;
  const cur = c.account.currency ?? "TRY";
  const isGoogle = c.provider === "google";
  const missing = d.coverage.state === "missing" || d.coverage.state === "none";
  const fmtN = (v: number, dg = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: dg, minimumFractionDigits: dg }).format(v);
  const moneyRaw = (v: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur }).format(v);
  const money = (v: number | null) => (missing ? "Veri yok" : v === null ? "—" : moneyRaw(v));
  const num = (v: number | null, dg = 0) => (missing ? "Veri yok" : v === null ? "—" : fmtN(v, dg));
  const pct = (v: number | null) => (missing ? "Veri yok" : v === null ? "—" : `%${fmtN(v, 2)}`);
  const reachText = d.reach.state === "unsupported" ? "Desteklenmiyor" : d.reach.state === "ok" ? fmtN(d.reach.reach ?? 0) : d.reach.state === "error" ? "Alınamadı" : "Veri yok";
  const freqText = d.reach.state === "unsupported" ? "Desteklenmiyor" : d.reach.state === "ok" && d.reach.frequency !== null ? fmtN(d.reach.frequency, 2) : d.reach.state === "error" ? "Alınamadı" : "Veri yok";
  const convLabel = isGoogle ? "Dönüşüm" : "Satın alma";
  // Önceki dönem kapsamda ama değer 0 ise yüzde hesaplanamaz; "karşılaştırma yok" yerine bunu söyleriz.
  const prevVal: Record<string, number | null | undefined> = p ? { Harcama: p.spend, Gösterim: p.impressions, Tıklama: p.clicks, CTR: p.ctr, CPC: p.cpc, CPM: p.cpm, [isGoogle ? "Dönüşüm" : "Satın alma"]: p.purchases, CPA: p.cpa, "Dönüşüm değeri": p.value, ROAS: p.roas } : {};
  const kpis: { label: string; value: string; delta: number | null; invert?: boolean; hint?: string }[] = [
    { label: "Harcama", value: money(t.spend), delta: change(t.spend, p?.spend), invert: true },
    { label: "Gösterim", value: num(t.impressions), delta: change(t.impressions, p?.impressions) },
    { label: "Erişim", value: reachText, delta: null, hint: isGoogle ? "Google Ads bu raporda erişim sağlamaz." : "Dönem için tekilleştirilmiş erişim (Meta, tek dönem sorgusu)." },
    { label: "Frekans", value: freqText, delta: null },
    { label: "Tıklama", value: num(t.clicks), delta: change(t.clicks, p?.clicks), hint: isGoogle ? undefined : "Meta 'clicks': tüm tıklamalar (bağlantı tıklaması değil)." },
    { label: "CTR", value: pct(t.ctr), delta: change(t.ctr, p?.ctr) },
    { label: "CPC", value: money(t.cpc), delta: change(t.cpc, p?.cpc), invert: true },
    { label: "CPM", value: money(t.cpm), delta: change(t.cpm, p?.cpm), invert: true },
    { label: convLabel, value: num(t.purchases, 1), delta: change(t.purchases, p?.purchases) },
    { label: "CPA", value: money(t.cpa), delta: change(t.cpa, p?.cpa), invert: true },
    { label: "Dönüşüm değeri", value: money(t.value), delta: change(t.value, p?.value), hint: "Platformun raporladığı değer; ikas sipariş cirosu değildir." },
    { label: "ROAS", value: missing ? "Veri yok" : t.roas === null ? "—" : fmtN(t.roas, 2), delta: change(t.roas, p?.roas) },
  ];
  const days = d.daily.map((x) => x.date);
  const unc = d.daily.map((x) => !x.covered);
  const back = adLink("/reklam/kampanyalar", range, null);
  const exp = (tablo: string) => adLink("/api/reklam/disa-aktar", range, null, { rapor: "kampanya", id: c.id, tablo });
  const budgetVal = (v: number | null) => (v === null ? (b.level ? "Tanımlı değil" : "Veri yok") : moneyRaw(v));
  const usage = (v: number | null) => (v === null ? "—" : `%${fmtN(v * 100, 1)}`);

  return (
    <>
      <AdShell tab="kampanya" title={c.name} desc={`${PROVIDER[c.provider][0]} · ${c.account.name} (${c.account.externalId}) · kampanya ${c.externalId} · ${range.label} (${range.from} – ${range.to}) · karşılaştırma: ${d.prevRange.from} – ${d.prevRange.to}${d.prev ? "" : " (veri yok)"}`}
        platform={c.provider as AdPlatform} conn={conn} range={range} siteId={null} switchBase="/reklam/kampanyalar">
        <Link href={back} className="btn-ghost">← Kampanyalar</Link>
      </AdShell>
      <AdFilters base={`/reklam/kampanyalar/${c.id}`} range={range} sites={[]} siteId={null} exportHref={exp("gunluk")} />
      <CoverageNote coverage={d.coverage} />
      {c.account.metricsError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
          Son senkron başarısız: {c.account.metricsError}{" "}
          {c.account.metricsSyncedAt ? `Gösterilen veriler ${fmtTime(c.account.metricsSyncedAt)} tarihindeki son başarılı senkrona aittir; sonrası "veri yok" sayılır.` : "Henüz başarılı bir senkron yok."}
        </p>
      )}
      {!c.account.selected && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Bu kampanyanın hesabı raporlamaya dahil değil; veriler güncellenmiyor olabilir.</p>}

      {/* Kampanya bilgileri ve bütçe */}
      <section className="card mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-xs text-gray-500">Platform ve durum</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`badge ${PROVIDER[c.provider][1]}`}>{PROVIDER[c.provider][0]}</span>
            <span className={`badge ${statusTone(c.status)}`}>{c.status ?? "Durum bilinmiyor"}</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">Hedef / tür: <b className="text-gray-700">{c.objective ?? "Veri yok"}</b></div>
          <div className="mt-1 text-xs text-gray-500">Mağaza / site: {c.websites.map((w) => w.name).join(", ") || "atanmamış"}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Günlük bütçe{b.source === "adsets" ? " (etkin reklam setlerinin toplamı)" : ""}</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{budgetVal(b.daily)}</div>
          <div className="mt-1 text-xs text-gray-500">Dönemde kullanım: <b className="text-gray-700">{usage(b.dailyUsage)}</b>{b.dailyUsage !== null && ` (${moneyRaw(t.spend)} / ${moneyRaw((b.daily ?? 0) * range.days)})`}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Ömür boyu bütçe</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{budgetVal(b.lifetime)}</div>
          <div className="mt-1 text-xs text-gray-500">Kullanım: <b className="text-gray-700">{usage(b.lifetimeUsage)}</b>{b.lifetimeUsage !== null && b.lifetimeSince && ` · ${b.lifetimeSince} tarihinden beri senkronlanan harcamaya göre`}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Dönem harcaması</div>
          <div className="mt-1 text-lg font-bold tabular-nums">{money(t.spend)}</div>
          <div className="mt-1 text-xs text-gray-500">{b.level === null ? "Bütçe bilgisi henüz senkronlanmadı." : b.level === "adset" && !b.daily && !b.lifetime ? "Bütçe reklam seti düzeyinde; etkin reklam setinde bütçe yok." : "Bütçe güncel değerdir; dönem içinde değiştiyse kullanım oranı yaklaşıktır."}</div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6 [&>*]:min-w-0">
        {kpis.map((k) => (
          <div key={k.label} className="card p-3" title={k.hint}>
            <div className="truncate text-xs text-gray-500">{k.label}</div>
            <div className="mt-1 truncate text-lg font-bold tabular-nums">{k.value}</div>
            <div className="mt-1.5"><Delta v={missing ? null : k.delta} invert={k.invert} prevZero={!missing && prevVal[k.label] === 0} /></div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricChart uncovered={unc} title="Günlük harcama" days={days} current={d.daily.map((x) => x.spend)} previous={d.prevDaily.map((x) => x.spend)} format={moneyRaw} />
        <MetricChart uncovered={unc} title={`Günlük ${convLabel.toLocaleLowerCase("tr")}`} days={days} current={d.daily.map((x) => x.purchases)} previous={d.prevDaily.map((x) => x.purchases)} format={(v) => fmtN(v, 1)} color="#0ea5e9" />
        <MetricChart uncovered={unc} title="Günlük dönüşüm değeri" days={days} current={d.daily.map((x) => x.value)} previous={d.prevDaily.map((x) => x.value)} format={moneyRaw} color="#10b981" />
        <MetricChart uncovered={unc} title="Günlük ROAS" days={days} current={d.daily.map((x) => x.roas)} previous={d.prevDaily.map((x) => x.roas)} format={(v) => fmtN(v, 2)} color="#f59e0b" />
      </div>

      {/* Reklam setleri / reklam grupları */}
      <section className="card mt-5 overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="font-semibold">{isGoogle ? "Reklam grupları" : "Reklam setleri"} <span className="text-sm font-normal text-gray-500">· {d.adsets.length}</span></h2>
          <a href={exp("setler")} className="text-sm font-medium text-indigo-700 hover:underline" download>CSV indir</a>
        </div>
        <LevelNote levels={d.levels} />
        <table className="mt-3 w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>{[isGoogle ? "Reklam grubu" : "Reklam seti", "Durum", ...(isGoogle ? [] : ["Bütçe", "Optimizasyon"]), "Harcama", "Gösterim", "Erişim", "Tıklama", "CTR", "CPC", "CPM", convLabel, "CPA", "Değer", "ROAS", "Δ Harcama"].map((h, i) => <th key={h} className={`th ${i > (isGoogle ? 1 : 3) ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {d.adsets.map((s) => (
              <tr key={s.id}>
                <td className="td"><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400">{s.externalId}</div></td>
                <td className="td"><span className={`badge ${statusTone(s.status)}`}>{s.status ?? "—"}</span></td>
                {!isGoogle && <td className="td whitespace-nowrap text-sm">{s.dailyBudget ? `${moneyRaw(s.dailyBudget)}/gün` : s.lifetimeBudget ? `${moneyRaw(s.lifetimeBudget)} ömür` : <span className="text-gray-400">Kampanya bütçesi</span>}</td>}
                {!isGoogle && <td className="td text-xs text-gray-600">{s.optimization ?? "—"}</td>}
                <MetricCells r={s} money={money} fmtN={fmtN} />
                <td className="td text-right text-xs"><Delta v={change(s.spend, s.prev.spend)} invert /></td>
              </tr>
            ))}
            {!d.adsets.length && <tr><td className="td py-8 text-center text-gray-500" colSpan={isGoogle ? 14 : 16}>{d.levels.syncedAt ? "Bu dönemde reklam seti verisi yok." : "Reklam seti verisi henüz senkronlanmadı (bir sonraki senkronda gelir)."}</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Reklamlar */}
      <section className="card mt-5 overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="font-semibold">Reklamlar <span className="text-sm font-normal text-gray-500">· {d.ads.length}</span></h2>
          <a href={exp("reklamlar")} className="text-sm font-medium text-indigo-700 hover:underline" download>CSV indir</a>
        </div>
        <table className="mt-3 w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>{["Reklam", isGoogle ? "Reklam grubu" : "Reklam seti", "Durum", ...(isGoogle ? ["Tür"] : []), "Harcama", "Gösterim", "Erişim", "Tıklama", "CTR", "CPC", "CPM", convLabel, "CPA", "Değer", "ROAS"].map((h, i) => <th key={h} className={`th ${i > (isGoogle ? 3 : 2) ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {d.ads.map((a) => (
              <tr key={a.id}>
                <td className="td"><Link href={adLink(`/reklam/kreatifler/${a.id}`, range, null)} className="font-medium hover:text-indigo-700 hover:underline">{a.name}</Link><div className="text-xs text-gray-400">{a.externalId}</div></td>
                <td className="td text-sm text-gray-600">{a.adSet}</td>
                <td className="td"><span className={`badge ${statusTone(a.status)}`}>{a.status ?? "—"}</span></td>
                {isGoogle && <td className="td text-xs text-gray-600">{a.adType ?? "—"}</td>}
                <MetricCells r={a} money={money} fmtN={fmtN} />
              </tr>
            ))}
            {!d.ads.length && <tr><td className="td py-8 text-center text-gray-500" colSpan={15}>{d.levels.syncedAt ? "Bu dönemde reklam verisi yok." : "Reklam verisi henüz senkronlanmadı."}</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card mt-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Günlük döküm</h2>
        <table className="mt-3 w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>{["Tarih", "Harcama", "Gösterim", "Tıklama", convLabel, "Dönüşüm değeri", "ROAS", "Önceki dönem harcama"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...d.daily].map((x, i) => ({ x, pv: d.prevDaily[i] })).reverse().map(({ x, pv }) => (
              <tr key={x.date} className={x.covered ? (x.spend || x.impressions ? "" : "text-gray-400") : "text-gray-400"}>
                <td className="td whitespace-nowrap">{x.date}</td>
                {x.covered ? (
                  <>
                    <td className="td text-right tabular-nums">{moneyRaw(x.spend ?? 0)}</td>
                    <td className="td text-right tabular-nums">{fmtN(x.impressions ?? 0)}</td>
                    <td className="td text-right tabular-nums">{fmtN(x.clicks ?? 0)}</td>
                    <td className="td text-right tabular-nums">{fmtN(x.purchases ?? 0, 1)}</td>
                    <td className="td text-right tabular-nums">{moneyRaw(x.value ?? 0)}</td>
                    <td className="td text-right tabular-nums">{x.roas === null ? "—" : fmtN(x.roas, 2)}</td>
                  </>
                ) : <td className="td text-center" colSpan={6}>Veri yok (senkron kapsamı dışında)</td>}
                <td className="td text-right tabular-nums">{pv?.covered ? moneyRaw(pv.spend ?? 0) : "Veri yok"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <AdSourceNote providers={[c.provider]} demo={d.demo} />
    </>
  );
}

type M = { spend: number; impressions: number; clicks: number; ctr: number | null; cpc: number | null; cpm: number | null; purchases: number; cpa: number | null; value: number; roas: number | null; reach: { state: string; reach?: number | null } };
function MetricCells({ r, money, fmtN }: { r: M; money: (v: number | null) => string; fmtN: (v: number, d?: number) => string }) {
  const reach = r.reach.state === "unsupported" ? <span className="text-gray-400">Desteklenmiyor</span> : r.reach.state === "ok" && r.reach.reach !== null && r.reach.reach !== undefined ? fmtN(r.reach.reach) : <span className="text-gray-400">Veri yok</span>;
  return (
    <>
      <td className="td text-right tabular-nums">{money(r.spend)}</td>
      <td className="td text-right tabular-nums">{fmtN(r.impressions)}</td>
      <td className="td whitespace-nowrap text-right tabular-nums text-sm">{reach}</td>
      <td className="td text-right tabular-nums">{fmtN(r.clicks)}</td>
      <td className="td text-right tabular-nums">{r.ctr === null ? "—" : `%${fmtN(r.ctr, 2)}`}</td>
      <td className="td text-right tabular-nums">{money(r.cpc)}</td>
      <td className="td text-right tabular-nums">{money(r.cpm)}</td>
      <td className="td text-right tabular-nums">{fmtN(r.purchases, 1)}</td>
      <td className="td text-right tabular-nums">{money(r.cpa)}</td>
      <td className="td text-right tabular-nums">{money(r.value)}</td>
      <td className="td text-right font-semibold tabular-nums">{r.roas === null ? "—" : fmtN(r.roas, 2)}</td>
    </>
  );
}

const fmtTime = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

function LevelNote({ levels }: { levels: { syncedAt: Date | null; error: string | null } }) {
  if (levels.error)
    return (
      <p className="mx-5 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
        Son senkronda reklam seti/reklam verisi alınamadı: {levels.error}{" "}
        {levels.syncedAt ? `Tablodaki veriler ${fmtTime(levels.syncedAt)} tarihindeki son başarılı senkrona aittir.` : "Henüz başarılı bir alt düzey senkron yok."} Kampanya düzeyi veriler bundan etkilenmez.
      </p>
    );
  if (!levels.syncedAt) return null;
  return <p className="mx-5 mt-1 text-xs text-gray-500">Son senkron: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(levels.syncedAt)}. Erişim, dönem için Meta&apos;nın döndürdüğü değerdir; reklam seti ve reklam erişimleri toplanamaz.</p>;
}
