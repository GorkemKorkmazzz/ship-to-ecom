import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { tl2 } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, fmtDate } from "../../ui";
import { cancelOrder, notifyTransfer } from "../actions";
import { OrderSummary, PAY_STATUS } from "../summary";

export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const p = await db.payment.findFirst({ where: { id: sp.id ?? "", userId: user.id } });
  if (!p) redirect("/lisans");
  const bank = { name: process.env.BANK_ACCOUNT_NAME, iban: process.env.BANK_IBAN, bank: process.env.BANK_NAME };
  const open = p.status === "bekliyor";
  const b = JSON.parse(p.billingJson) as { name: string; taxNumber: string; taxOffice: string; address: string; district: string; city: string };

  return (
    <>
      <PageHeader title="Ödeme" desc={open ? "Adım 2 / 2 — ödemenizi tamamlayın." : `Sipariş ${p.reference}`}>
        <Link href="/lisans" className="btn-ghost">← Lisans</Link>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-gray-500">Sipariş no</div>
              <div className="font-mono text-lg font-semibold">{p.reference}</div>
            </div>
            <span className={`badge ${PAY_STATUS[p.status]?.[1]}`}>{PAY_STATUS[p.status]?.[0]}</span>
          </section>

          {p.status === "odendi" && (
            <section className="card border-emerald-200 bg-emerald-50 text-sm text-emerald-800">
              Ödemeniz {fmtDate(p.paidAt)} tarihinde onaylandı. Lisansınız {fmtDate(p.periodEnd)} tarihine kadar geçerli.
            </section>
          )}
          {p.status === "bildirildi" && (
            <section className="card border-sky-200 bg-sky-50 text-sm text-sky-800">
              Havale bildiriminiz alındı. Ödeme hesabımıza ulaştığında lisansınız etkinleşir; genellikle aynı iş günü içinde.
            </section>
          )}

          {(open || p.status === "bildirildi") && (
            <section className="card">
              <h2 className="font-semibold">Havale / EFT ile öde</h2>
              {bank.iban ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-gray-500">Alıcı</dt><dd className="select-all text-right font-medium">{bank.name}</dd></div>
                  {bank.bank && <div className="flex justify-between gap-4"><dt className="text-gray-500">Banka</dt><dd className="text-right">{bank.bank}</dd></div>}
                  <div className="flex justify-between gap-4"><dt className="text-gray-500">IBAN</dt><dd className="select-all text-right font-mono">{bank.iban}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-gray-500">Tutar</dt><dd className="select-all text-right font-semibold tabular-nums">{tl2(p.total)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-gray-500">Açıklama</dt><dd className="select-all text-right font-mono font-semibold">{p.reference}</dd></div>
                </dl>
              ) : (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Banka bilgileri henüz tanımlanmamış. Lütfen destek ile iletişime geçin.</p>
              )}
              <p className="mt-3 text-xs text-gray-500">Açıklama alanına sipariş numarasını yazmanız, ödemenizin hızlı eşleşmesini sağlar.</p>
              {open && bank.iban && (
                <form action={notifyTransfer} className="mt-4">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn">Havaleyi yaptım, bildir</button>
                </form>
              )}
            </section>
          )}

          {open && (
            <section className="card opacity-80">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Kredi / banka kartı ile öde</h2>
                <span className="badge bg-gray-100 text-gray-600">Yakında</span>
              </div>
              <p className="mt-2 text-sm text-gray-600">Kartla ödeme, ödeme kuruluşunun güvenli sayfası üzerinden alınacak. Kart bilgileriniz ShipToEcom tarafından görülmez ve saklanmaz.</p>
              <button className="btn mt-3" disabled>Kartla öde</button>
            </section>
          )}

          <section className="card text-sm">
            <h2 className="font-semibold">Fatura bilgileri</h2>
            <p className="mt-2 text-gray-700">{b.name}</p>
            <p className="text-gray-500">{b.taxOffice ? `${b.taxOffice} V.D. · ` : ""}{b.taxNumber}</p>
            <p className="text-gray-500">{b.address}, {b.district} / {b.city}</p>
            {open && <Link className="mt-2 inline-block text-indigo-600 hover:underline" href={`/lisans/odeme?paket=${p.plan}&donem=${p.period}`}>Fatura bilgilerini düzenle</Link>}
          </section>

          {(open || p.status === "bildirildi") && (
            <form action={cancelOrder}>
              <input type="hidden" name="id" value={p.id} />
              <button className="text-sm text-red-600 hover:underline">Siparişi iptal et</button>
            </form>
          )}
        </div>
        <OrderSummary plan={p.plan} period={p.period} amount={p.amount} vat={p.vat} total={p.total} />
      </div>
    </>
  );
}
