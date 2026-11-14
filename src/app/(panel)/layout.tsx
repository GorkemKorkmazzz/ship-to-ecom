import { storeHost } from "@/lib/platforms";
import Link from "next/link";
import { logout } from "@/app/actions";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { accountStatus, planById, storeLimitOf } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { Logo } from "./logo";
import { Nav } from "./nav";
import { ROUTE_MODULES, hasModule } from "@/lib/access";
import { STORE_HEX } from "./ui";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [stores, unread] = await Promise.all([getStores(user.id), db.notification.count({ where: { userId: user.id, readAt: null } })]);
  const plan = planById(user.plan);
  const status = accountStatus(user, new Date().getTime());
  const daysLeft = user.trialEndsAt ? Math.max(0, Math.ceil((user.trialEndsAt.getTime() - new Date().getTime()) / 86400000)) : 0;

  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex shrink-0 flex-col border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex h-[68px] items-center justify-between border-b border-gray-200 px-4">
          <Link href="/panel"><Logo /></Link>
          <form action={logout} className="lg:hidden">
            <button className="btn-ghost">Çıkış</button>
          </form>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 lg:py-4">
          <Nav locked={ROUTE_MODULES.filter(([, m]) => !hasModule(user, m)).map(([p]) => p)} />

          <div className="mt-6 hidden lg:block">
            <div className="mb-1.5 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              <span>Bağlı mağazalar</span>
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-indigo-700">{stores.length}/{storeLimitOf(user.plan)}</span>
            </div>
            <div className="space-y-1">
              {stores.map((s, i) => (
                <Link key={s.id} href={`/siparisler?magaza=${s.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-100">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.lastError ? "#ef4444" : STORE_HEX[i % STORE_HEX.length] }} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-800">{s.label}</span>
                    <span className="block truncate text-xs text-gray-400">{storeHost(s)}</span>
                  </span>
                </Link>
              ))}
              {stores.length < storeLimitOf(user.plan) && <Link href="/entegrasyonlar" className="block rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50">+ Mağaza bağla</Link>}
            </div>
          </div>
        </div>
        <div className="hidden border-t border-gray-200 p-3 lg:block">
          <div className="rounded-lg bg-indigo-50 px-3 py-2.5">
            <div className="flex items-center justify-between text-sm font-semibold text-indigo-900">
              {plan?.name ?? "Paket"}
              <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                {status === "odeme" ? "Aktif" : status === "deneme" ? `Deneme · ${daysLeft} gün` : "Süresi doldu"}
              </span>
            </div>
            <Link href="/lisans" className="mt-1 block text-xs font-medium text-indigo-700 hover:underline">Lisans satın al →</Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 hidden border-b border-gray-200 bg-white/90 px-5 backdrop-blur lg:block">
          <div className="flex h-[68px] items-center gap-3">
            <form action="/urunler" className="flex h-10 w-full max-w-xl items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input name="q" aria-label="Ürün ara" placeholder="Ürün adı veya SKU ara…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
            </form>
            <div className="ml-auto flex items-center gap-3">
              <Link href="/bildirimler" className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label={`Bildirimler${unread ? `, ${unread} okunmamış` : ""}`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" /></svg>
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-[1.1rem] text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold uppercase text-indigo-700">{user.email[0]}</span>
              <span className="hidden max-w-[14rem] truncate text-sm text-gray-600 xl:inline">{user.email}</span>
              <form action={logout}><button className="btn-ghost">Çıkış</button></form>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <footer className="mx-4 flex flex-col gap-1 border-t border-gray-200 py-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between lg:mx-6">
          <span>© ShipToEcom</span>
          <span>
            Panel arayüzü: Designed &amp; developed by{" "}
            <a className="font-semibold text-orange-700 hover:underline" href="https://datadropx.net" target="_blank" rel="noreferrer">DataDropX</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
