import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/actions";
import { hasValidSession } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ hata?: string }> }) {
  if (await hasValidSession()) redirect("/panel");
  const { hata } = await searchParams;
  return (
    <form action={login} className="space-y-4">
      <h1 className="text-lg font-semibold">Giriş yap</h1>
      {hata && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>}
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
      </div>
      <button className="btn w-full">Giriş yap</button>
      <p className="text-center text-sm text-gray-500">Hesabınız yok mu? <Link className="text-indigo-600 hover:underline" href="/kayit">Kayıt olun</Link></p>
    </form>
  );
}
