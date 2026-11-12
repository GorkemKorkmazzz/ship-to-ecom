import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { Logo } from "../../(panel)/logo";
import { adminLogout } from "../actions";
import { AdminNav } from "./nav";

export const metadata = { title: "ShipToEcom Yönetim" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="flex shrink-0 flex-col border-b border-gray-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="flex h-[68px] items-center justify-between border-b border-gray-200 px-4">
          <Link href="/backoffice" className="flex items-center gap-2">
            <Logo />
            <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">Yönetim</span>
          </Link>
          <form action={adminLogout} className="lg:hidden"><button className="btn-ghost">Çıkış</button></form>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 lg:py-4">
          <AdminNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 hidden border-b border-gray-200 bg-white/90 px-5 backdrop-blur lg:block">
          <div className="flex h-[68px] items-center gap-3">
            <form action="/backoffice/hesaplar" className="flex h-10 w-full max-w-xl items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              <input name="q" aria-label="Hesap ara" placeholder="E-posta veya mağaza ara…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
            </form>
            <div className="ml-auto flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold uppercase text-indigo-700">{admin.email[0]}</span>
              <span className="hidden max-w-[14rem] truncate text-sm text-gray-600 xl:inline">{admin.email}</span>
              <form action={adminLogout}><button className="btn-ghost">Çıkış</button></form>
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <footer className="mx-4 flex flex-col gap-1 border-t border-gray-200 py-4 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between lg:mx-6">
          <span>© ShipToEcom Yönetim</span>
          <span>
            Panel arayüzü: Designed &amp; developed by{" "}
            <a className="font-semibold text-orange-700 hover:underline" href="https://datadropx.net" target="_blank" rel="noreferrer">DataDropX</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
