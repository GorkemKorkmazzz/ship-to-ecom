import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getAdmin } from "@/lib/session";
import { Logo } from "../../(panel)/logo";
import { adminLogin, adminSetup } from "../actions";

export const metadata = { title: "ShipToEcom Yönetim" };

export default async function Page({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  if (await getAdmin()) redirect("/backoffice");
  const { hata } = await searchParams;
  const setup = (await db.admin.count()) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo />
          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">Yönetim paneli</span>
        </div>
        <form action={setup ? adminSetup : adminLogin} className="card space-y-4">
          <h1 className="text-lg font-semibold">{setup ? "İlk yönetici hesabını oluştur" : "Yönetici girişi"}</h1>
          {hata && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>}
          {setup && (
            <div>
              <label className="label" htmlFor="key">Kurulum anahtarı</label>
              <input className="input font-mono" id="key" name="key" type="password" autoComplete="off" required />
              <p className="mt-1 text-xs text-gray-500">Proje klasöründeki <code>.env</code> dosyasında <code>ADMIN_SETUP_KEY</code> satırında yazar.</p>
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">E-posta</label>
            <input className="input" id="email" name="email" type="email" autoComplete="username" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Şifre</label>
            <input className="input" id="password" name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} minLength={setup ? 10 : undefined} required />
          </div>
          <button className="btn w-full">{setup ? "Hesabı oluştur" : "Giriş yap"}</button>
        </form>
      </div>
    </main>
  );
}
