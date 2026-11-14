import Link from "next/link";
import { MODULES, PLANS } from "@/lib/plans";

/** Paketin kapsamadığı bir sayfa açıldığında gösterilen yükseltme kartı. */
export function Locked({ moduleId }: { moduleId: string }) {
  const m = MODULES.find((x) => x.id === moduleId);
  const plan = PLANS.find((p) => p.id === m?.plan);
  return (
    <div className="card mx-auto mt-10 max-w-lg text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 11h12v10H6zM8 11V7a4 4 0 018 0v4" /></svg>
      </span>
      <h1 className="mt-4 text-lg font-semibold">{m?.name ?? "Bu modül"} {plan?.name} paketinde</h1>
      <p className="mt-2 text-sm text-gray-600">{m?.text}</p>
      <p className="mt-2 text-sm text-gray-600">Mevcut paketiniz bu modülü kapsamıyor. Kullanmak için paketinizi yükseltin; verileriniz ve ayarlarınız korunur.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Link href="/lisans" className="btn">Paketi yükselt</Link>
        <Link href="/panel" className="btn-ghost">Özete dön</Link>
      </div>
    </div>
  );
}
