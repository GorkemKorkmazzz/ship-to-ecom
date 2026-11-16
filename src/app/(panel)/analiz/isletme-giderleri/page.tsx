import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { db } from "@/lib/db";
import { EXPENSE_CATEGORIES } from "@/lib/finance/ingest-core";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtMoney } from "../../ui";
import { addOperatingExpense, cancelOperatingExpense } from "./actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ tamam?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const [stores, list] = await Promise.all([
    db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
    db.expense.findMany({ where: { userId: user.id }, orderBy: { periodStart: "desc" }, take: 200 }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.label]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const day = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);
  return (
    <>
      <PageHeader title="İşletme giderleri" desc="Siparişe bağlı olmayan giderler (personel, kira, yazılım, depolama…). İşletme kârı yalnızca bu giderler girildiğinde hesaplanır.">
        <Link href="/analiz/giderler" className="btn-ghost">Satış giderleri</Link>
        <Link href="/analiz" className="btn-ghost">← Kârlılık</Link>
      </PageHeader>
      {sp.tamam && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{sp.tamam}</p>}
      {sp.hata && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{sp.hata}</p>}
      <p className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">
        Gider bir dönemi kapsar ve rapor aralığına gün bazında paylaştırılır (ör. 1–30 Kasım kirası, 1–10 Kasım raporuna 1/3 oranında girer). Meta ve Google reklam harcamaları senkronla zaten alınır; burada yalnızca bu platformların dışındaki reklam giderlerini girin, aksi halde iki kez sayılır.
      </p>
      <section className="card mb-5">
        <form action={addOperatingExpense} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="block"><span className="label">Kategori</span><select className="input" name="category" required>{Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="label">Tutar</span><input className="input" name="amount" inputMode="decimal" required /></label>
          <label className="block"><span className="label">Para birimi</span><input className="input" name="currency" defaultValue="TRY" maxLength={3} required /></label>
          <label className="block"><span className="label">Mağaza (isteğe bağlı)</span><select className="input" name="storeId" defaultValue=""><option value="">Tüm işletme</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="block"><span className="label">Dönem başlangıcı</span><input className="input" type="date" name="periodStart" required /></label>
          <label className="block"><span className="label">Dönem bitişi</span><input className="input" type="date" name="periodEnd" defaultValue={today} required /></label>
          <label className="block"><span className="label">KDV tutarı</span><input className="input" name="taxAmount" inputMode="decimal" placeholder="bilinmiyorsa boş" /></label>
          <label className="block"><span className="label">KDV oranı (%)</span><input className="input" name="taxRate" inputMode="decimal" placeholder="bilinmiyorsa boş" /></label>
          <label className="block"><span className="label">Tutar KDV dahil mi?</span><select className="input" name="taxInclusive" defaultValue=""><option value="">Bilinmiyor</option><option value="1">KDV dahil</option><option value="0">KDV hariç</option></select></label>
          <label className="block sm:col-span-2"><span className="label">Not</span><input className="input" name="note" maxLength={200} /></label>
          <div className="flex items-end"><button className="btn">Kaydet</button></div>
        </form>
      </section>
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Dönem</th><th className="px-3 py-2">Kategori</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-right">KDV</th><th className="px-3 py-2">Mağaza</th><th className="px-3 py-2">Not</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((e) => (
              <tr key={e.id} className={e.status === "CANCELLED" ? "text-gray-400 line-through" : ""}>
                <td className="px-3 py-2">{day(e.periodStart)} – {day(e.periodEnd)}</td>
                <td className="px-3 py-2">{EXPENSE_CATEGORIES[e.category as keyof typeof EXPENSE_CATEGORIES] ?? e.category}{e.source === "DEMO" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800">DEMO</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(e.amount, e.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.taxAmount == null ? "—" : fmtMoney(e.taxAmount, e.currency)}</td>
                <td className="px-3 py-2">{e.storeId ? storeName.get(e.storeId) : "Tüm işletme"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{e.note}</td>
                <td className="px-3 py-2 text-right">{e.status !== "CANCELLED" && <form action={cancelOperatingExpense}><input type="hidden" name="id" value={e.id} /><button className="text-xs text-red-600 hover:underline">İptal et</button></form>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-500">Kayıtlı işletme gideri yok.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
