import { db } from "@/lib/db";
import { planById, tl2 } from "@/lib/plans";
import { Flash, fmtDate } from "../../../(panel)/ui";
import { approvePayment, rejectPayment } from "../../actions";

const STATUS: Record<string, [string, string]> = {
  bildirildi: ["Havale bildirildi", "bg-sky-100 text-sky-700"],
  bekliyor: ["Ödeme bekleniyor", "bg-amber-100 text-amber-800"],
  odendi: ["Ödendi", "bg-emerald-100 text-emerald-700"],
  iptal: ["İptal", "bg-gray-100 text-gray-600"],
};
const ORDER = ["bildirildi", "bekliyor", "odendi", "iptal"];

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const payments = (await db.payment.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 300 }))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const waiting = payments.filter((p) => p.status === "bildirildi").length;
  const paid = payments.filter((p) => p.status === "odendi").reduce((a, p) => a + p.total, 0);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Ödemeler</h1>
        <p className="text-sm text-gray-500">{waiting} onay bekleyen · tahsil edilen toplam {tl2(paid)}</p>
      </div>
      <Flash ok={sp.ok} hata={sp.hata} />
      <div className="space-y-3">
        {payments.map((p) => {
          const b = JSON.parse(p.billingJson) as Record<string, string>;
          const open = p.status === "bekliyor" || p.status === "bildirildi";
          return (
            <div key={p.id} className={`card ${p.status === "bildirildi" ? "border-sky-300" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-semibold">{p.reference}</span>
                    <span className={`badge ${STATUS[p.status]?.[1]}`}>{STATUS[p.status]?.[0] ?? p.status}</span>
                    <span className="badge bg-indigo-100 text-indigo-700">{planById(p.plan)?.name} · {p.period === "yillik" ? "yıllık" : "aylık"}</span>
                  </div>
                  <div className="mt-1 text-sm">{p.user.email}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {b.name} · {b.taxOffice ? `${b.taxOffice} V.D. ` : ""}{b.taxNumber} · {b.address}, {b.district} / {b.city} · {b.phone} · {b.email}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    Oluşturma: {fmtDate(p.createdAt)}{p.paidAt ? ` · Onay: ${fmtDate(p.paidAt)} · Lisans bitişi: ${fmtDate(p.periodEnd)}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold tabular-nums">{tl2(p.total)}</div>
                  <div className="text-xs text-gray-500">{tl2(p.amount)} + {tl2(p.vat)} KDV</div>
                </div>
              </div>
              {open && (
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                  <form action={approvePayment}><input type="hidden" name="id" value={p.id} /><button className="btn">Ödemeyi onayla</button></form>
                  <form action={rejectPayment}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost text-red-600">İptal et</button></form>
                </div>
              )}
            </div>
          );
        })}
        {!payments.length && <p className="card text-center text-sm text-gray-500">Henüz sipariş yok.</p>}
      </div>
    </>
  );
}
