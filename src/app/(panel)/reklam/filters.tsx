import Link from "next/link";
import { AD_PRESETS } from "@/lib/ads/report";

type Range = { from: string; to: string; preset: string | null };

/**
 * Reklam sayfalarının ortak bağlantı üreticisi. extra: sayfaya özel filtreler (platform, kampanya, sıralama…);
 * site ya da tarih değişince korunur.
 */
export function adLink(base: string, range: Range, siteId: string | null, patch: Record<string, string | null> = {}, extra: Record<string, string | null> = {}) {
  const p = new URLSearchParams();
  const cur = { site: siteId, gun: range.preset ?? null, baslangic: range.preset ? null : range.from, bitis: range.preset ? null : range.to, ...extra, ...patch };
  for (const [k, v] of Object.entries(cur)) if (v && !(k === "gun" && v === "30")) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * Ortak filtre çubuğu: mağaza/site, hazır dönem ya da özel aralık, isteğe bağlı platform ve kampanya filtresi, CSV dışa aktarma.
 * platform/campaigns verilmezse o filtre gösterilmez (sayfa desteklemiyorsa).
 */
export function AdFilters({ base, range, sites, siteId, extra = {}, platform, campaigns, campaignId, exportHref, selects = [], inputs = [] }: {
  base: string; range: Range; sites: { id: string; name: string }[]; siteId: string | null; extra?: Record<string, string | null>;
  platform?: string | null; campaigns?: { id: string; name: string; provider: string }[]; campaignId?: string | null; exportHref?: string;
  /** Sayfaya özel ek seçimler (ör. reklam seti, kreatif türü, sıralama); aynı formda gönderilir. */
  selects?: { name: string; label: string; value: string | null; options: [string, string][]; all?: string }[];
  /** Serbest metin filtreleri (ör. ürün adı, SKU). */
  inputs?: { name: string; label: string; value: string | null }[];
}) {
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  // Formda gönderilmeyen ama korunması gereken parametreler.
  const own = new Set([...(platform !== undefined ? ["platform"] : []), ...(campaigns ? ["kampanya"] : []), ...selects.map((x) => x.name), ...inputs.map((x) => x.name)]);
  const hidden = { site: siteId, ...Object.fromEntries(Object.entries(extra).filter(([k]) => !own.has(k))) };
  return (
    <div className="mb-5 space-y-3">
      {sites.length > 0 && (
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1" aria-label="Mağaza / site">
          <Link href={adLink(base, range, null, { site: null }, extra)} className={pill(!siteId)}>Tüm mağazalar</Link>
          {sites.map((s) => <Link key={s.id} href={adLink(base, range, siteId, { site: s.id }, extra)} className={pill(siteId === s.id)}>{s.name}</Link>)}
        </div>
      )}
      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
        {Object.entries(hidden).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label className="block min-w-[150px] flex-1 sm:flex-none">
          <span className="label">Dönem</span>
          <select className="input" name="gun" defaultValue={range.preset ?? ""}>
            {AD_PRESETS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            <option value="">Özel aralık (aşağıdaki tarihler)</option>
          </select>
        </label>
        <label className="block"><span className="label">Başlangıç</span><input className="input" type="date" name="baslangic" defaultValue={range.preset ? "" : range.from} /></label>
        <label className="block"><span className="label">Bitiş</span><input className="input" type="date" name="bitis" defaultValue={range.preset ? "" : range.to} /></label>
        {platform !== undefined && (
          <label className="block">
            <span className="label">Platform</span>
            <select className="input" name="platform" defaultValue={platform ?? ""}>
              <option value="">Tüm platformlar</option>
              <option value="meta">Meta</option>
              <option value="google">Google Ads</option>
            </select>
          </label>
        )}
        {campaigns && (
          <label className="block min-w-[180px] max-w-full flex-1">
            <span className="label">Kampanya</span>
            <select className="input" name="kampanya" defaultValue={campaignId ?? ""}>
              <option value="">Tüm kampanyalar</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.provider === "google" ? "Google · " : "Meta · "}{c.name}</option>)}
            </select>
          </label>
        )}
        {selects.map((x) => (
          <label key={x.name} className="block min-w-[140px] max-w-full flex-1 sm:flex-none">
            <span className="label">{x.label}</span>
            <select className="input" name={x.name} defaultValue={x.value ?? ""}>
              {x.all !== undefined && <option value="">{x.all}</option>}
              {x.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        {inputs.map((x) => (
          <label key={x.name} className="block min-w-[140px] max-w-full flex-1 sm:flex-none">
            <span className="label">{x.label}</span>
            <input className="input" name={x.name} defaultValue={x.value ?? ""} placeholder="Ara…" />
          </label>
        ))}
        <button className="btn">Uygula</button>
        {exportHref && <a href={exportHref} className="btn-ghost" download>CSV indir</a>}
        <span className="basis-full text-xs text-gray-500">{range.from} – {range.to} · Tarih seçilirse dönem yerine özel aralık uygulanır. Günler Türkiye saatine göredir.</span>
      </form>
    </div>
  );
}

/** Veri kaynağı ve atıf modeli notu. Platform dönüşümleri kendi atıf modelleriyle ölçülür ve birbirine eklenmemelidir. */
export function AdSourceNote({ providers, demo }: { providers: string[]; demo?: boolean }) {
  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
      <p className="font-semibold text-gray-700">Veri kaynağı ve atıf</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {providers.includes("meta") && <li><b>Meta</b>: Marketing API Insights. Satın almalar reklam hesabının atıf ayarıyla ölçülür (Meta varsayılanı 7 gün tıklama + 1 gün görüntüleme). Erişim günler arasında toplanamaz; dönem erişimi ayrı sorgulanır.</li>}
        {providers.includes("google") && <li><b>Google Ads</b>: Google Ads API. &quot;Dönüşüm&quot;, hesapta dönüşüme dahil edilen tüm işlemleri ve her işlemin kendi atıf modelini kapsar (yalnızca satın alma olmayabilir). Erişim ve frekans bu raporda desteklenmez.</li>}
        <li>Platformların raporladığı ciro, ikas&apos;taki gerçek sipariş cirosundan ayrıdır; aynı sipariş iki platformda da dönüşüm sayılabilir, bu yüzden platform değerleri toplanınca gerçek satıştan yüksek çıkabilir.</li>
        <li><b>—</b> hesaplanamayan oran, <b>Veri yok</b> senkronla kapsanmayan dönem, <b>Desteklenmiyor</b> platformun sağlamadığı metrik demektir; <b>0</b> gerçekten sıfırdır.</li>
        {demo && <li className="text-amber-700">Bu hesapta demo reklam bağlantısı var: veriler sentetiktir, platformlara istek gönderilmez.</li>}
      </ul>
    </div>
  );
}

/** Veri kapsamı uyarısı (kısmi ya da hiç veri yok). */
export function CoverageNote({ coverage }: { coverage: { state: string; from: string | null; to: string | null } }) {
  if (coverage.state === "ok") return null;
  const text =
    coverage.state === "none" ? "Bu filtrede raporlamaya dahil reklam hesabı yok."
    : coverage.state === "missing" ? `Seçilen dönem için veri yok: senkron ${coverage.from ?? "?"} – ${coverage.to ?? "?"} aralığını kapsıyor.`
    : `Kısmi veri: senkron ${coverage.from ?? "?"} – ${coverage.to ?? "?"} aralığını kapsıyor; dönemin bu aralık dışındaki günleri "veri yok" sayılır, sıfır değildir.`;
  return <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{text}</p>;
}
