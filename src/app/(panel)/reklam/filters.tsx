import Link from "next/link";

type Range = { from: string; to: string; preset: number | null };

/** Reklam sayfalarının ortak filtre çubuğu: site, hazır dönem (7/30/90) ve özel tarih. */
/** extra: sayfaya özel diğer filtreler (ör. platform, sıralama); site ya da tarih değişince korunur. */
export function adLink(base: string, range: Range, siteId: string | null, patch: Record<string, string | null> = {}, extra: Record<string, string | null> = {}) {
  const p = new URLSearchParams();
  const cur = { site: siteId, gun: range.preset ? String(range.preset) : null, baslangic: range.preset ? null : range.from, bitis: range.preset ? null : range.to, ...extra, ...patch };
  for (const [k, v] of Object.entries(cur)) if (v && !(k === "gun" && v === "30")) p.set(k, v);
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

export function AdFilters({ base, range, sites, siteId, extra = {} }: { base: string; range: Range; sites: { id: string; name: string }[]; siteId: string | null; extra?: Record<string, string | null> }) {
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  return (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
        <Link href={adLink(base, range, null, { site: null }, extra)} className={pill(!siteId)}>Tüm siteler</Link>
        {sites.map((s) => <Link key={s.id} href={adLink(base, range, siteId, { site: s.id }, extra)} className={pill(siteId === s.id)}>{s.name}</Link>)}
      </div>
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
        {[7, 30, 90].map((n) => <Link key={n} href={adLink(base, range, siteId, { gun: String(n), baslangic: null, bitis: null }, extra)} className={pill(range.preset === n)}>Son {n} gün</Link>)}
      </div>
      <form className="flex flex-wrap items-end gap-2">
        {siteId && <input type="hidden" name="site" value={siteId} />}
        {Object.entries(extra).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <label className="block"><span className="label">Başlangıç</span><input className="input" type="date" name="baslangic" defaultValue={range.from} /></label>
        <label className="block"><span className="label">Bitiş</span><input className="input" type="date" name="bitis" defaultValue={range.to} /></label>
        <button className={range.preset ? "btn-ghost" : "btn"}>Özel tarih</button>
      </form>
    </div>
  );
}
