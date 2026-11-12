import Link from "next/link";
import { redirect } from "next/navigation";
import { register } from "@/app/actions";
import { hasValidSession } from "@/lib/session";

export default async function Page({ searchParams }: { searchParams: Promise<{ hata?: string; paket?: string; donem?: string }> }) {
  if (await hasValidSession()) redirect("/panel");
  const { hata, paket, donem } = await searchParams;
  return (
    <form action={register} className="space-y-4">
      <h1 className="text-lg font-semibold">14 gün ücretsiz deneyin</h1>
      <input type="hidden" name="paket" value={paket ?? ""} />
      <input type="hidden" name="donem" value={donem ?? ""} />
      {hata && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{hata}</p>}
      <div>
        <label className="label" htmlFor="email">E-posta</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Şifre</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <button className="btn w-full">Hesap oluştur</button>
      <p className="text-center text-sm text-gray-500">Zaten hesabınız var mı? <Link className="text-indigo-600 hover:underline" href="/giris">Giriş yapın</Link></p>
    </form>
  );
}
