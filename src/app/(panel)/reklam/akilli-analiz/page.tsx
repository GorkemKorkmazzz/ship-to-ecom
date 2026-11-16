import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { narrate } from "@/lib/ai/narrator";
import type { Insight, Priority } from "@/lib/ads/insight-engine";
import { adConnections, resolveAdPlatform } from "@/lib/ads/platform";
import { parseAdRange } from "@/lib/ads/report";
import { buildSmartAnalysis } from "@/lib/ads/smart";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { AdShell, PLATFORM_NAME } from "../ad-shell";
import { AdFilters, CoverageNote, adLink } from "../filters";

type SP = { site?: string; gun?: string; baslangic?: string; bitis?: string; platform?: string; ai?: string; oncelik?: string };
const PRIO: Record<Priority, [string, string, string]> = {
  kritik: ["Kritik", "border-red-200 bg-red-50/40", "bg-red-100 text-red-700"],
  onemli: ["Önemli", "border-amber-200 bg-amber-50/40", "bg-amber-100 text-amber-800"],
  firsat: ["Fırsat", "border-emerald-200 bg-emerald-50/40", "bg-emerald-100 text-emerald-700"],
  bilgi: ["Bilgilendirme", "border-gray-200 bg-white", "bg-gray-100 text-gray-600"],
};
const VERDICT: Record<string, [string, string]> = { iyi: ["Yükselişte", "bg-emerald-50 text-emerald-700"], kotu: ["Düşüşte", "bg-red-50 text-red-700"], sabit: ["Belirgin değişim yok", "bg-gray-100 text-gray-600"], yetersiz: ["Yetersiz veri", "bg-gray-100 text-gray-500"] };
const ENTITY: Record<string, string> = { hesap: "Hesap", kampanya: "Kampanya", kreatif: "Kreatif", urun: "Ürün" };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!hasModule(user, "reklam")) return <Locked moduleId="reklam" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const [platform, conn, sites] = await Promise.all([resolveAdPlatform(sp.platform), adConnections(user.id), db.website.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })]);
  const siteId = sp.site && sites.some((s) => s.id === sp.site) ? sp.site : null;
  const a = await buildSmartAnalysis(user.id, range, siteId, platform);
  const r = a.result;
  const prio = sp.oncelik && sp.oncelik in PRIO ? (sp.oncelik as Priority) : null;
  const shown = r ? r.insights.filter((x) => !prio || x.priority === prio) : [];
  const counts = r ? (Object.keys(PRIO) as Priority[]).map((p) => [p, r.insights.filter((x) => x.priority === p).length] as const) : [];
  const dt = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);
  const extra = { platform, oncelik: prio };
  // Yapay zekâ yalnızca "Analiz oluştur" ile ve yalnızca doğrulanmış olgularla çalışır.
  const facts = r ? [
    `Platform: ${PLATFORM_NAME[platform]}${a.demo ? " (DEMO verisi)" : ""}. Dönem: ${range.from} – ${range.to}, önceki eş dönem: ${a.prev.from} – ${a.prev.to}.`,
    "Özet olguları:", ...r.summary.map((s) => `- ${s}`),
    "Uyarılar ve öneriler:", ...r.insights.slice(0, 12).map((x) => `- [${PRIO[x.priority][0]}] ${x.title} · ${ENTITY[x.entity.type]}: ${x.entity.name}. ${x.finding} Öneri: ${x.action}`),
  ].join("\n") : "";
  const ai = sp.ai === "1" && r ? await narrate(facts) : null;

  return (
    <>
      <AdShell tab="akilli" title="Akıllı Reklam Analizi" desc={`${a.site ? a.site.name : "Tüm mağazalar"} · ${range.label} (${range.from} – ${range.to}) · önceki eş dönem: ${a.prev.from} – ${a.prev.to}`}
        platform={platform} conn={conn} range={range} siteId={siteId} switchBase="/reklam/akilli-analiz" />
      <AdFilters base="/reklam/akilli-analiz" range={range} sites={sites} siteId={siteId} extra={extra} />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm">
        <div className="text-gray-600">
          <span>Son veri güncellemesi: <b>{a.lastSync ? dt(a.lastSync) : "senkron yok"}</b></span>
          <span className="mx-2 text-gray-300">·</span><span>Analiz zamanı: {dt(a.analyzedAt)}</span>
          {!a.productSynced && a.accounts > 0 && <span className="ml-2 text-xs text-amber-700">(ürün düzeyi veri senkronlanmadı)</span>}
        </div>
        <form>
          {Object.entries({ site: siteId, gun: range.preset, baslangic: range.preset ? null : range.from, bitis: range.preset ? null : range.to, platform, oncelik: prio }).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="ai" value="1" />
          <button className="btn" disabled={!r}>Analiz oluştur</button>
        </form>
      </div>
      <CoverageNote coverage={a.coverage} />
      {a.prevCoverage.state !== "ok" && a.coverage.state !== "none" && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">Önceki eş dönem senkronla tam kapsanmıyor ({a.prevCoverage.state === "missing" ? "veri yok" : "kısmi"}); dönem karşılaştırmaları yapılmadı.</p>}

      {!r ? (
        <div className="card py-10 text-center text-sm text-gray-600">Bu filtrede analiz edilecek {PLATFORM_NAME[platform]} verisi yok. <Link href="/reklam-hesaplari" className="font-medium text-indigo-700 hover:underline">Reklam hesapları</Link></div>
      ) : (
        <>
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Performans özeti · {PLATFORM_NAME[platform]}</h2>
              {ai?.ok ? <span className="rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Yapay zekâ ile açıklandı · {ai.model}</span> : <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">Kural tabanlı</span>}
            </div>
            {ai?.ok ? (
              <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-800">{ai.text}</div>
            ) : (
              <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-gray-800">{r.summary.map((s) => <li key={s}>{s}</li>)}</ul>
            )}
            {ai && !ai.ok && <p className="mt-3 text-xs text-gray-500">Yapay zekâ açıklaması kullanılamadı: {ai.detail} Kural tabanlı analiz gösteriliyor.</p>}
            {ai?.ok && <details className="mt-3 text-xs text-gray-500"><summary className="cursor-pointer">Dayanak olgular (kural tabanlı)</summary><ul className="mt-2 space-y-1">{r.summary.map((s) => <li key={s}>{s}</li>)}</ul></details>}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
              {r.totalChanges.filter((c) => ["spend", "value", "conversions", "roas"].includes(c.metric)).map((c) => (
                <div key={c.metric} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="text-xs text-gray-500">{c.label} değişimi</div>
                  <div className={`text-lg font-bold tabular-nums ${c.rel === null ? "text-gray-400" : ""}`}>{c.rel === null ? "Hesaplanamaz" : `${c.rel >= 0 ? "+" : "−"}%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(Math.abs(c.rel * 100))}`}</div>
                  <div className="text-[11px] text-gray-400">{!c.enough ? "yetersiz veri" : c.significant ? "anlamlı değişim" : "eşiğin altında"}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="mr-2 font-semibold">Akıllı uyarılar ve öneriler ({r.insights.length})</h2>
              <Link href={adLink("/reklam/akilli-analiz", range, siteId, { oncelik: null }, extra)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${!prio ? "bg-indigo-600 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200"}`}>Tümü</Link>
              {counts.map(([p, n]) => <Link key={p} href={adLink("/reklam/akilli-analiz", range, siteId, { oncelik: p }, extra)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${prio === p ? "bg-indigo-600 text-white" : `${PRIO[p][2]}`}`}>{PRIO[p][0]} · {n}</Link>)}
            </div>
            {shown.length ? (
              <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">{shown.map((x) => <Card key={x.id} x={x} platform={PLATFORM_NAME[platform]} at={dt(a.analyzedAt)} range={range} siteId={siteId} />)}</div>
            ) : <p className="card text-sm text-gray-500">Bu öncelikte uyarı yok. Uyarılar yalnızca yeterli veri ve anlamlı değişim olduğunda üretilir.</p>}
          </section>

          <section className="card mt-5 overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Kampanya bazlı analiz</h2>
            <p className="px-5 text-xs text-gray-500">Değişimler yalnızca yeterli veriyle gösterilir. &quot;Gözlenen bileşen&quot; ROAS = dönüşüm oranı × dönüşüm başına değer ÷ CPC ayrıştırmasıdır; neden-sonuç tespiti değildir.</p>
            <div className="mt-3 divide-y divide-gray-100">
              {r.campaignAnalyses.slice(0, 20).map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={adLink(`/reklam/kampanyalar/${c.id}`, range, null)} className="font-medium hover:text-indigo-700">{c.name}</Link>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT[c.verdict][1]}`}>{VERDICT[c.verdict][0]}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-gray-700">{c.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                  {c.actions.length > 0 && <p className="mt-1 text-sm text-indigo-800">Değerlendirilebilecek adımlar: {c.actions.join(" ")}</p>}
                </div>
              ))}
            </div>
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <section className="card">
              <h2 className="font-semibold">Kreatif değerlendirmesi</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {([["best", "En iyi performans (yeterli veriyle, ortalama ROAS üstü)"], ["ctrUp", "CTR'si anlamlı yükselenler"], ["roasDown", "ROAS'ı düşenler"], ["spendNoConv", "Yüksek harcama, dönüşüm yok"]] as const).map(([k, label]) => (
                  <li key={k}><span className="text-gray-500">{label}:</span> {r.creativeFindings[k].length ? r.creativeFindings[k].map((id) => a.creativeName.get(id) ?? id).join(", ") : <span className="text-gray-400">yok</span>}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-gray-500">Kreatif yorgunluğu tespit edilmez: kreatif düzeyinde günlük frekans verisi yok; yalnızca dönem karşılaştırması yapılır.</p>
            </section>
            <section className="card">
              <h2 className="font-semibold">Ürün bazlı değerlendirme</h2>
              <ul className="mt-2 space-y-1 text-sm">
                <li><span className="text-gray-500">Bütçe artırımı değerlendirilebilecek:</span> {r.products.best.length ? r.products.best.map((p) => p.name).join(", ") : <span className="text-gray-400">yeterli veriyle yok</span>}</li>
                <li><span className="text-gray-500">Harcama yüksek, satış zayıf:</span> {r.products.weak.length ? r.products.weak.map((p) => p.name).join(", ") : <span className="text-gray-400">yok</span>}</li>
                <li><span className="text-gray-500">Reklamsız satan (potansiyel):</span> {r.products.potential.length ? r.products.potential.map((p) => p.name).join(", ") : <span className="text-gray-400">yok</span>}</li>
              </ul>
              <p className="mt-2 text-xs text-gray-500">Ürün harcaması yalnızca platformun ürün kırılımından gelir; tahmini dağıtım yapılmaz. {platform === "meta" ? "Meta ürün başına dönüşüm vermediği için ürün ROAS'ı ikas UTM cirosu / ürün harcamasıdır." : "Ürün ROAS'ı Google ürün dönüşüm değeri / ürün harcamasıdır."} <Link href={adLink("/reklam/urun-analizi", range, siteId, { platform })} className="font-medium text-indigo-700 hover:underline">Ürün Bazlı Analiz →</Link></p>
            </section>
          </div>

          <section className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
            <p className="font-semibold text-gray-700">Analiz yöntemi</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Analiz kural tabanlıdır ve yalnızca {PLATFORM_NAME[platform]} verisini kullanır; diğer platformun dönüşümleri ve ikas sipariş cirosu bu metriklere eklenmez.</li>
              <li>Önceki dönem aynı uzunluktadır. CTR ve dönüşüm oranı değişimleri %95 güvenle (z-testi), ROAS/CPA her iki dönemde en az 5 dönüşüm, CPC en az 100 tıklama ve en az %20 göreli değişimle değerlendirilir.</li>
              <li>Öneriler otomatik uygulanmaz; reklam hesaplarında hiçbir ayar değiştirilmez. Kararlar sizindir.</li>
              <li>&quot;Analiz oluştur&quot; yapay zekâ yapılandırılmışsa doğrulanmış olguları doğal dilde açıklar; olgularda olmayan bir sayı içeren yanıt reddedilir.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function Card({ x, platform, at, range, siteId }: { x: Insight; platform: string; at: string; range: { from: string; to: string; preset: string | null }; siteId: string | null }) {
  const href = x.entity.type === "kampanya" && x.entity.id ? adLink(`/reklam/kampanyalar/${x.entity.id}`, range, null)
    : x.entity.type === "kreatif" && x.entity.id ? adLink(`/reklam/kreatifler/${x.entity.id}`, range, null)
    : x.entity.type === "urun" && x.entity.id ? adLink(`/reklam/urun-analizi/${encodeURIComponent(x.entity.id)}`, range, siteId) : null;
  return (
    <article className={`rounded-xl border p-4 ${PRIO[x.priority][1]}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${PRIO[x.priority][2]}`}>{PRIO[x.priority][0]}</span>
        <span className="text-[11px] text-gray-500">{platform}</span>
        <span className="ml-auto text-[11px] text-gray-400">{at}</span>
      </div>
      <h3 className="mt-2 font-semibold text-gray-900">{x.title}</h3>
      <p className="text-xs text-gray-500">{ENTITY[x.entity.type]}: {href ? <Link href={href} className="font-medium text-indigo-700 hover:underline">{x.entity.name}</Link> : x.entity.name}</p>
      <p className="mt-2 text-sm text-gray-800">{x.finding}</p>
      <dl className="mt-2 flex flex-wrap gap-2">{x.metrics.map((m) => <div key={m.label} className="rounded-md bg-white/80 px-2 py-1 text-xs ring-1 ring-gray-200"><dt className="inline text-gray-500">{m.label}: </dt><dd className="inline font-semibold tabular-nums">{m.value}</dd></div>)}</dl>
      <p className="mt-2 text-sm text-indigo-900"><b>Önerilen aksiyon:</b> {x.action}</p>
      <p className="mt-1 text-[11px] text-gray-400">Dayanak: {x.basis.join(" · ")}</p>
    </article>
  );
}
