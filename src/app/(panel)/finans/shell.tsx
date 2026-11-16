import Link from "next/link";
import { CHANNELS } from "@/lib/finance/dashboard";
import { FIN_NAV } from "./fin-nav";

export type FinParams = { gun?: string; baslangic?: string; bitis?: string; magaza?: string; kanal?: string; para?: string; karsilastir?: string };
const PRESETS = [["bugun", "Bugün"], ["dun", "Dün"], ["7", "Son 7 Gün"], ["30", "Son 30 Gün"], ["bu-ay", "Bu Ay"], ["gecen-ay", "Geçen Ay"]] as const;

/** Finans sayfalarının bağlantı üreticisi: filtreler sayfalar arasında korunur. */
export function finLink(base: string, sp: FinParams, patch: Partial<FinParams> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v && !(k === "gun" && v === "30")) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

/** Finans Merkezi üst bölümü: başlık, demo etiketi ve filtre satırı (referans tasarım). */
export function FinanceShell({ base, title, desc, sp, range, stores, currencies, currency, demo, lastSync }: {
  base: string; title: string; desc: string; sp: FinParams; range: { from: string; to: string; preset: string | null };
  stores: { id: string; label: string }[]; currencies: string[]; currency: string; demo: boolean; lastSync: Date | null;
}) {
  const custom = !range.preset;
  const active = FIN_NAV.find((n) => n.href === base);
  const pill = (on: boolean) => `whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-medium transition-colors ${on ? "bg-[#F1EDFF] text-[#633BFF] ring-1 ring-[#633BFF]/40" : "text-gray-600 hover:bg-gray-50"}`;
  const sel = "h-9 max-w-[170px] truncate rounded-xl border border-[#ECEAF5] bg-white pl-2.5 pr-7 text-[12.5px] font-medium text-gray-700 outline-none focus:border-[#633BFF]";
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F1EDFF] text-[#633BFF]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden><rect x="4" y="12" width="4" height="8" rx="1" /><rect x="10" y="7" width="4" height="13" rx="1" /><rect x="16" y="3" width="4" height="17" rx="1" /></svg>
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-[#1E1B4B]">{title}</h1>
            <p className="text-sm text-gray-500">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {demo && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F1EDFF] px-3 py-1 text-xs font-semibold text-[#633BFF]"><span className="h-1.5 w-1.5 rounded-full bg-[#633BFF]" />Demo Hesabı</span>}
          {lastSync && <span className="hidden text-xs text-gray-400 sm:inline">Son senkron: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(lastSync)}</span>}
        </div>
      </div>

      <form action={base} className="mb-5 flex flex-wrap items-center gap-1.5 2xl:gap-2">
        <div className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-[#ECEAF5] bg-white p-1">
          {PRESETS.map(([k, l]) => <Link key={k} href={finLink(base, { ...sp, baslangic: undefined, bitis: undefined }, { gun: k })} className={pill(range.preset === k)}>{l}</Link>)}
          <details className="relative">
            <summary className={`${pill(custom)} flex cursor-pointer list-none items-center gap-1.5`}>
              Özel Tarih
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
            </summary>
            <div className="absolute left-0 z-20 mt-2 flex w-64 flex-col gap-2 rounded-xl border border-[#ECEAF5] bg-white p-3 shadow-lg">
              <label className="text-xs text-gray-500">Başlangıç<input className="input mt-1" type="date" name="baslangic" defaultValue={custom ? range.from : ""} /></label>
              <label className="text-xs text-gray-500">Bitiş<input className="input mt-1" type="date" name="bitis" defaultValue={custom ? range.to : ""} /></label>
              <button className="btn">Uygula</button>
            </div>
          </details>
        </div>
        {!custom && <input type="hidden" name="gun" value={range.preset ?? ""} />}
        <select name="magaza" defaultValue={sp.magaza ?? ""} className={sel} aria-label="Mağaza"><option value="">Tüm Mağazalar</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <select name="kanal" defaultValue={sp.kanal ?? ""} className={sel} aria-label="Satış kanalı"><option value="">Tüm Kanallar</option>{CHANNELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="para" defaultValue={currency} className={sel} aria-label="Para birimi">{(currencies.length ? currencies : [currency]).map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select name="karsilastir" defaultValue={sp.karsilastir ?? ""} className={sel} aria-label="Karşılaştırma"><option value="">Önceki Dönemle Karşılaştır</option><option value="0">Karşılaştırma Yok</option></select>
        <button className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-[#633BFF] px-4 text-[13px] font-semibold text-white shadow-sm hover:bg-[#5430E0]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /></svg>
          Analizi Yenile
        </button>
      </form>
      {active && active.href !== "/finans" && <nav className="mb-4 flex max-w-full gap-1 overflow-x-auto lg:hidden" aria-label="Finans sayfaları">{FIN_NAV.map((n) => <Link key={n.href} href={finLink(n.href, sp)} className={pill(n.href === base)}>{n.label}</Link>)}</nav>}
    </>
  );
}

/** Sayfa zemini: çok açık lila arka plan (referans tasarım). */
export function FinanceBg({ children }: { children: React.ReactNode }) {
  // Masaüstünde panelin max-w-6xl kabından taşar: kenar menünün (16rem) yanındaki alanın tamamını kullanır (referans tasarım geniş yerleşim).
  return (
    <div className="-mx-4 -my-6 min-h-full bg-[#F8F7FD] px-4 py-6 lg:relative lg:left-1/2 lg:mx-0 lg:w-[calc(100vw-17rem)] lg:max-w-[1720px] lg:-translate-x-1/2 lg:px-6">
      {children}
    </div>
  );
}
