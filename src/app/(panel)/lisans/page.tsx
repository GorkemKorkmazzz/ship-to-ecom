import Link from "next/link";
import { db } from "@/lib/db";
import { PLANS, accountStatus, planById, priceOf, tl, tl2 } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, fmtDate } from "../ui";
import { PAY_STATUS } from "./summary";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; donem?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const yearly = sp.donem !== "aylik";
  const payments = await db.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const status = accountStatus(user, new Date().getTime());
  const current = planById(user.plan);
  const pill = (active: boolean) => `rounded-lg px-4 py-2 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;

  return (
    <>
      <PageHeader title="Lisans" desc="Paketinizi seçin, fatura bilgilerinizi girin ve ödemenizi tamamlayın." />
      <Flash ok={sp.ok} hata={sp.hata} />

      <section className="card mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-500">Mevcut paketiniz</div>
          <div className="mt-0.5 text-lg font-semibold">{current?.name ?? "—"} <span className="text-sm font-normal text-gray-500">· {user.billingPeriod === "yillik" ? "yıllık" : "aylık"}</span></div>
        </div>
        <div className="text-right text-sm">
          {status === "odeme" && <><span className="badge bg-emerald-100 text-emerald-700">Lisans aktif</span><div className="mt-1 text-gray-500">Bitiş: {fmtDate(user.paidUntil)}</div></>}
          {status === "deneme" && <><span className="badge bg-sky-100 text-sky-700">Deneme sürümü</span><div className="mt-1 text-gray-500">Deneme bitişi: {fmtDate(user.trialEndsAt)}</div></>}
          {status === "suresi-doldu" && <span className="badge bg-amber-100 text-amber-800">Süresi doldu — lisans satın alın</span>}
        </div>
      </section>

      <div className="mx-auto mb-5 flex w-fit gap-1 rounded-xl border border-gray-200 bg-white p-1">
        <Link href="/lisans?donem=aylik" className={pill(!yearly)}>Aylık</Link>
        <Link href="/lisans?donem=yillik" className={pill(yearly)}>Yıllık · %20 indirim</Link>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {PLANS.map((p) => {
          const price = priceOf(p.id, yearly ? "yillik" : "aylik")!;
          return (
            <div key={p.id} className={`card flex flex-col ${p.popular ? "border-indigo-600 ring-4 ring-indigo-100" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{p.name}</h2>
                {p.popular && <span className="badge bg-indigo-600 text-white">Önerilen</span>}
              </div>
              <p className="text-sm text-gray-500">{p.tagline}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums">{tl(yearly ? p.yearlyMonthly : p.monthly)}</span>
                <span className="text-sm text-gray-500">/ ay + KDV</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{yearly ? `Yıllık ${tl2(price.total)} (KDV dahil) tek ödeme` : `Aylık ${tl2(price.total)} (KDV dahil)`}</p>
              <Link href={`/lisans/odeme?paket=${p.id}&donem=${price.period}`} className={`mt-4 ${p.popular ? "btn" : "btn-ghost py-2"}`}>Satın al</Link>
              <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-indigo-600">✓</span>{f}</li>)}
              </ul>
            </div>
          );
        })}
      </div>

      <section className="card mt-6 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 font-semibold">Siparişlerim</h2>
        <table className="mt-3 w-full">
          <thead className="border-y border-gray-200 bg-gray-50">
            <tr><th className="th">Sipariş</th><th className="th">Paket</th><th className="th">Tarih</th><th className="th">Durum</th><th className="th text-right">Tutar</th><th className="th" /></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="td font-mono text-xs">{p.reference}</td>
                <td className="td">{planById(p.plan)?.name} · {p.period === "yillik" ? "yıllık" : "aylık"}</td>
                <td className="td whitespace-nowrap text-gray-600">{fmtDate(p.createdAt)}</td>
                <td className="td"><span className={`badge ${PAY_STATUS[p.status]?.[1]}`}>{PAY_STATUS[p.status]?.[0] ?? p.status}</span></td>
                <td className="td text-right font-medium tabular-nums">{tl2(p.total)}</td>
                <td className="td text-right"><Link className="text-sm text-indigo-600 hover:underline" href={`/lisans/siparis?id=${p.id}`}>Görüntüle</Link></td>
              </tr>
            ))}
            {!payments.length && <tr><td className="td py-8 text-center text-gray-500" colSpan={6}>Henüz sipariş yok.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
