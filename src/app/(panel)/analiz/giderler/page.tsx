import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { db } from "@/lib/db";
import { TXN_TYPES } from "@/lib/finance/ingest";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtMoney } from "../../ui";
import { addExpense, cancelExpense } from "./actions";

const SRC: Record<string, string> = { MANUAL: "Elle", IKAS: "ikas", DEMO: "Demo", TRENDYOL: "Trendyol", HEPSIBURADA: "Hepsiburada", AMAZON: "Amazon", N11: "N11" };

export default async function Page({ searchParams }: { searchParams: Promise<{ tamam?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const [stores, list] = await Promise.all([
    db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } }),
    db.financialTransaction.findMany({ where: { userId: user.id }, orderBy: { occurredAt: "desc" }, take: 200, include: { order: { select: { orderNumber: true } } } }),
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const day = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);
  return (
    <>
      <PageHeader title="Satış giderleri" desc="Komisyon, ödeme kesintisi, kargo ve diğer sipariş giderleri. ikas bu giderleri sağlamadığı için elle girilir; pazaryeri entegrasyonları aynı kayıt yapısını kullanır.">
        <Link href="/analiz/isletme-giderleri" className="btn-ghost">İşletme giderleri</Link>
        <Link href="/analiz" className="btn-ghost">← Kârlılık</Link>
      </PageHeader>
      {sp.tamam && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{sp.tamam}</p>}
      {sp.hata && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{sp.hata}</p>}
      <section className="card mb-5">
        <h2 className="font-semibold">Gider ekle</h2>
        <form action={addExpense} className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="block"><span className="label">Gider türü</span><select className="input" name="type" required>{Object.entries(TXN_TYPES).filter(([k]) => k !== "SHIPPING_INCOME").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="block"><span className="label">Tutar</span><input className="input" name="amount" inputMode="decimal" required /></label>
          <label className="block"><span className="label">Para birimi</span><input className="input" name="currency" defaultValue="TRY" maxLength={3} required /></label>
          <label className="block"><span className="label">Tarih</span><input className="input" type="date" name="occurredAt" defaultValue={today} max={today} required /></label>
          <label className="block"><span className="label">KDV tutarı</span><input className="input" name="taxAmount" inputMode="decimal" placeholder="bilinmiyorsa boş" /></label>
          <label className="block"><span className="label">KDV oranı (%)</span><input className="input" name="taxRate" inputMode="decimal" placeholder="bilinmiyorsa boş" /></label>
          <label className="block"><span className="label">Tutar KDV dahil mi?</span><select className="input" name="taxInclusive" defaultValue=""><option value="">Bilinmiyor</option><option value="1">KDV dahil</option><option value="0">KDV hariç</option></select></label>
          <label className="block"><span className="label">Mağaza (isteğe bağlı)</span><select className="input" name="storeId" defaultValue=""><option value="">Seçilmedi</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <label className="block"><span className="label">Sipariş no (isteğe bağlı)</span><input className="input" name="orderNumber" placeholder="siparişe bağlamak için" /></label>
          <label className="block"><span className="label">Ürünlere dağıtım</span><select className="input" name="method" defaultValue="REVENUE"><option value="REVENUE">Satış tutarına göre</option><option value="QUANTITY">Adede göre</option><option value="WEIGHT">Ağırlığa göre</option><option value="MANUAL">Elle</option></select></label>
          <label className="block sm:col-span-2"><span className="label">Elle dağıtım (yalnızca &quot;Elle&quot;)</span><input className="input" name="manual" placeholder="SKU-1=30; SKU-2=15" /></label>
          <label className="block sm:col-span-2"><span className="label">Not</span><input className="input" name="note" maxLength={200} /></label>
          <div className="flex items-end"><button className="btn">Kaydet</button></div>
        </form>
        <p className="mt-2 text-xs text-gray-500">Siparişe bağlanan gider o siparişin dönemine, bağlanmayan gider girilen tarihin dönemine yazılır. Siparişe bağlı gider, siparişin satılan kalemlerine seçilen yönteme göre dağıtılır. Ağırlık bilgisi ürünlerde tutulmadığı için &quot;ağırlığa göre&quot; seçilen gider dağıtılamaz ve ayrı gösterilir; siparişe bağlı olmayan giderler de ürünlere dağıtılmaz.</p>
      </section>
      <section className="card overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Tarih</th><th className="px-3 py-2">Tür</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-right">KDV</th><th className="px-3 py-2">Sipariş</th><th className="px-3 py-2">Dağıtım</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((t) => (
              <tr key={t.id} className={t.status === "CANCELLED" ? "text-gray-400 line-through" : ""}>
                <td className="px-3 py-2">{day(t.occurredAt)}</td>
                <td className="px-3 py-2">{TXN_TYPES[t.type as keyof typeof TXN_TYPES] ?? t.type}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(t.amount, t.currency)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.taxAmount == null ? "—" : fmtMoney(t.taxAmount, t.currency)}{t.taxInclusive != null && <span className="ml-1 text-xs text-gray-400">({t.taxInclusive ? "dahil" : "hariç"})</span>}</td>
                <td className="px-3 py-2">{t.order?.orderNumber ?? <span className="text-gray-400">bağlı değil</span>}</td>
                <td className="px-3 py-2 text-xs">{!t.orderId ? "—" : ({ REVENUE: "Satış tutarı", QUANTITY: "Adet", WEIGHT: "Ağırlık", MANUAL: "Elle" } as Record<string, string>)[t.allocationMethod ?? "REVENUE"]}</td>
                <td className="px-3 py-2">{SRC[t.source] ?? t.source}</td>
                <td className="px-3 py-2 text-xs">{t.status === "POSTED" ? "Kayıtlı" : t.status === "CANCELLED" ? "İptal" : "Bekliyor"}</td>
                <td className="px-3 py-2 text-right">{t.source === "MANUAL" && t.status !== "CANCELLED" && <form action={cancelExpense}><input type="hidden" name="id" value={t.id} /><button className="text-xs text-red-600 hover:underline">İptal et</button></form>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Kayıtlı gider yok.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  );
}
