import Link from "next/link";
import { CONN_LABEL, type AdConnections, type AdPlatform } from "@/lib/ads/platform";
import { AD_NAV, type AdTab } from "./ad-nav";
import { adLink } from "./filters";
import { PlatformMemory } from "./platform-memory";

type Range = { from: string; to: string; preset: string | null };
const TONE: Record<string, string> = { bagli: "bg-emerald-50 text-emerald-700", bekliyor: "bg-amber-50 text-amber-800", yok: "bg-gray-100 text-gray-600", hata: "bg-red-50 text-red-700" };
const DOT: Record<string, string> = { bagli: "bg-emerald-500", bekliyor: "bg-amber-500", yok: "bg-gray-400", hata: "bg-red-500" };

/** Resmi marka logoları yerine sade, tanınır platform işaretleri. */
export function PlatformMark({ p, className = "h-7 w-7" }: { p: AdPlatform; className?: string }) {
  return p === "meta" ? (
    <svg viewBox="0 0 40 24" className={className} aria-hidden fill="none" stroke="#0866ff" strokeWidth="4" strokeLinecap="round">
      <path d="M6 18c-2.5-3-2-10 1.5-12 4-2.3 7.5 3 12.5 10.5 4 6 8 7.5 11.5 5 3.5-2.6 3-10.5-.5-12.5-4.5-2.5-8 3.5-11 8.5-3.5 5.8-7.5 9-11 5.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M9.2 3.6l6.6 11.5-4.3 2.5L4.9 6.1z" fill="#fbbc04" />
      <path d="M14.8 3.6l6.6 11.5a2.5 2.5 0 01-4.3 2.5L10.5 6.1a2.5 2.5 0 014.3-2.5z" fill="#4285f4" />
      <circle cx="6" cy="17" r="3" fill="#34a853" />
    </svg>
  );
}
export const PLATFORM_NAME: Record<AdPlatform, string> = { meta: "Meta Ads", google: "Google Ads" };

/**
 * Reklam alanının ortak üst bölümü: başlık, Meta / Google platform kartları (gerçek bağlantı durumuyla) ve alt modül sekmeleri.
 * switchBase: platform değişince gidilecek sayfa (detay sayfalarında liste sayfası). keep: platform değişince korunacak parametreler.
 */
export function AdShell({ tab, title, desc, platform, conn, range, siteId, switchBase, keep = {}, children }: {
  tab: AdTab; title: string; desc?: string; platform: AdPlatform; conn: AdConnections; range: Range; siteId: string | null;
  switchBase: string; keep?: Record<string, string | null>; children?: React.ReactNode;
}) {
  const c = conn[platform];
  return (
    <>
      <PlatformMemory platform={platform} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 sm:flex">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 11-5.8-1.6" /></svg>
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
            {desc && <p className="mt-0.5 text-sm text-gray-500">{desc}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl" role="tablist" aria-label="Reklam platformu">
        {(["meta", "google"] as const).map((p) => {
          const on = p === platform, s = conn[p];
          return (
            <Link key={p} role="tab" aria-selected={on} href={adLink(switchBase, range, siteId, { platform: p }, keep)}
              className={`group relative flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition-all duration-200 ${on ? "border-indigo-500 bg-indigo-50/60 shadow-sm ring-2 ring-indigo-100" : "border-gray-200 hover:border-indigo-200 hover:bg-gray-50"}`}>
              <PlatformMark p={p} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900">{PLATFORM_NAME[p]}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {s.demo ? (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">DEMO · gerçek bağlantı değil</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${TONE[s.state]}`}><span className={`h-1.5 w-1.5 rounded-full ${DOT[s.state]}`} />{CONN_LABEL[s.state]}</span>
                  )}
                </span>
              </span>
              {on && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-indigo-600" aria-label="Seçili platform" />}
            </Link>
          );
        })}
      </div>

      <nav className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1" aria-label="Reklam modülleri">
        {AD_NAV.map((n) => {
          const on = n.key === tab;
          const cls = `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-indigo-600 text-white shadow-sm" : n.soon ? "cursor-not-allowed text-gray-400" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`;
          const icon = <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={n.d} /></svg>;
          return n.href ? (
            <Link key={n.key} href={adLink(n.href, range, siteId, { platform })} aria-current={on ? "page" : undefined} className={cls}>{icon}{n.label}</Link>
          ) : (
            <span key={n.key} className={cls} title="Bu modül henüz geliştirilmedi" aria-disabled>{icon}{n.label}<span className="rounded bg-gray-100 px-1 text-[10px] font-semibold text-gray-500">Yakında</span></span>
          );
        })}
      </nav>

      {c.state !== "bagli" && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${c.state === "hata" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
          <b>{PLATFORM_NAME[platform]}: {CONN_LABEL[c.state]}.</b>{" "}
          {c.state === "yok" ? `Bu platformun verilerini görmek için ${PLATFORM_NAME[platform]} hesabınızı bağlayın.` : c.detail}{" "}
          <Link href="/reklam-hesaplari" className="font-semibold underline">Reklam hesapları</Link>
        </div>
      )}
      {c.state === "bagli" && c.detail && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">{c.detail}</p>}
      {c.demo && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800"><b>DEMO</b> · {PLATFORM_NAME[platform]} bağlantısı demo hesabına aittir; gerçek bir platform bağlantısı değildir ve veriler sentetiktir.</p>}
    </>
  );
}
