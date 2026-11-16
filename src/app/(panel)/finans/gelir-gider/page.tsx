import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { EXPENSE_CATEGORIES, TXN_TYPES } from "@/lib/finance/ingest-core";
import { requireUser } from "@/lib/session";
import { loadFinance } from "../load";
import { FinanceBg, FinanceShell, type FinParams } from "../shell";
import { CardTitle, Empty, I, card, fmtMoneyFn } from "../ui";

const LEVELS: Record<string, [string, string]> = { kritik: ["Kritik", "bg-red-50 text-red-600"], onemli: ["Önemli", "bg-orange-50 text-orange-600"], firsat: ["Fırsat", "bg-blue-50 text-blue-600"], bilgi: ["Bilgi", "bg-indigo-50 text-indigo-600"] };

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const { range, d } = await loadFinance(user.id, sp);
  const money = fmtMoneyFn(d.currency);
  const f = d.finance, L = d.layers;
  const rows: [string, keyof NonNullable<typeof L>, "plus" | "minus" | "total"][] = [
    ["Brüt satış", "grossSales", "plus"], ["Net satış", "netSales", "total"], ["Ürün maliyeti", "productCost", "minus"], ["Brüt kâr", "grossProfit", "total"],
    ["Satış giderleri", "salesExpenses", "minus"], ["Katkı kârı", "contribution", "total"], ["İşletme kârı", "operatingProfit", "total"],
  ];
  return (
    <FinanceBg>
      <FinanceShell base="/finans/gelir-gider" title="Gelir ve Giderler" desc="Brüt satıştan işletme kârına kadar her katman, kaynağı ve veri durumu" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <section className={`${card} p-5 lg:col-span-2`}>
          <CardTitle icon={<I d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" />} title="Kâr katmanları" />
          {L ? (
            <table className="mt-3 w-full text-[13px]">
              <tbody className="divide-y divide-[#F1F0F7]">
                {rows.map(([label, k, kind]) => {
                  const l = L[k];
                  return (
                    <tr key={k} className={kind === "total" ? "bg-[#FAFAFD]" : ""}>
                      <td className={`py-2.5 pl-3 ${kind === "total" ? "font-semibold text-[#1E1B4B]" : "text-gray-600"}`}>{kind === "minus" ? "− " : ""}{label}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{l.amount === null ? <span className="font-normal text-gray-400">Veri yok</span> : money(l.amount)}{l.state === "partial" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">eksik</span>}</td>
                      <td className="py-2.5 pl-4 pr-3 text-[11px] text-gray-400">{l.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <div className="mt-3"><Empty text="Seçili filtrede sipariş yok." /></div>}
        </section>
        <section className={`${card} p-5`}>
          <CardTitle icon={<I d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />} title="Finansal Uyarılar" />
          <ul className="mt-3 space-y-2">
            {d.alerts.map((a) => <li key={a.text}><Link href={a.href} className="flex items-start gap-2 rounded-lg p-1 text-[13px] hover:bg-[#FAFAFD]"><span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${LEVELS[a.level][1]}`}>{LEVELS[a.level][0]}</span><span className="text-[#1E1B4B]">{a.text}</span></Link></li>)}
            {!d.alerts.length && <li><Empty text="Uyarı yok." /></li>}
          </ul>
        </section>
      </div>
      {f && (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <section className={`${card} p-5`}><CardTitle icon={<I d="M9 9h.01M15 15h.01M16 8l-8 8" />} title="İndirimler" />
            <dl className="mt-3 space-y-1.5 text-[13px]"><div className="flex justify-between"><dt className="text-gray-500">Ürün indirimi</dt><dd className="font-semibold">{f.discounts.product === null ? "veri yok" : money(f.discounts.product)}</dd></div><div className="flex justify-between"><dt className="text-gray-500">Sipariş indirimi</dt><dd className="font-semibold">{f.discounts.order === null ? "veri yok" : money(f.discounts.order)}</dd></div></dl>
            <p className="mt-2 text-[11px] text-gray-400">{f.discounts.orderNote}</p></section>
          <section className={`${card} p-5`}><CardTitle icon={<I d="M3 7h18v12H3zM3 11h18" />} title="Satış giderleri" />
            <dl className="mt-3 space-y-1.5 text-[13px]">{Object.entries(f.expenses.byType).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-gray-500">{TXN_TYPES[k as keyof typeof TXN_TYPES] ?? k}</dt><dd className="font-semibold tabular-nums">{money(v)}</dd></div>)}{!Object.keys(f.expenses.byType).length && <div className="text-gray-400">kayıt yok</div>}</dl>
            <p className="mt-2 text-[11px] text-gray-400">Ürünlere dağıtılan {money(f.allocation.allocated)}, dağıtılamayan {money(f.allocation.unallocated)}.</p>
            <Link href="/analiz/giderler" className="mt-2 inline-block text-xs font-semibold text-[#633BFF] hover:underline">Satış giderlerini yönet →</Link></section>
          <section className={`${card} p-5`}><CardTitle icon={<I d="M3 11l18-5v12L3 14v-3z" />} title="Reklam ve işletme" />
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-gray-500">Ürünle ilişkilendirilen reklam</dt><dd className="font-semibold">{f.ads.known ? money(f.ads.attributed) : "veri yok"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">İlişkilendirilemeyen reklam</dt><dd className="font-semibold">{f.ads.known ? money(f.ads.unattributed) : "veri yok"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">İşletme giderleri</dt><dd className="font-semibold">{f.operating.expenses === null ? "girilmedi" : money(f.operating.expenses)}</dd></div>
            </dl>
            <Link href="/analiz/isletme-giderleri" className="mt-2 inline-block text-xs font-semibold text-[#633BFF] hover:underline">İşletme giderlerini yönet →</Link></section>
          <section className={`${card} p-5`}><CardTitle icon={<I d="M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6" />} title="KDV ve kargo geliri" />
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-gray-500">Kalem KDV</dt><dd className="font-semibold">{f.tax.linesKnown ? money(f.tax.lines) : "veri yok"}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Kargo KDV</dt><dd className="font-semibold">{money(f.tax.shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Gider KDV</dt><dd className="font-semibold">{money(f.tax.expenses)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Kargo geliri (müşteriden)</dt><dd className="font-semibold">{f.shipping.ordersWithData ? money(f.shipping.income) : "veri yok"}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-gray-400">{f.tax.note}</p>
            <Link href="/analiz/maliyetler" className="mt-2 inline-block text-xs font-semibold text-[#633BFF] hover:underline">Maliyet geçmişini yönet →</Link></section>
        </div>
      )}
      {d.analysis.finans[0] && Object.keys(d.analysis.finans[0].isletmeGideriDokumu).length > 0 && (
        <section className={`${card} mt-4 p-5`}><CardTitle icon={<I d="M3 7h18v12H3z" />} title="İşletme gideri dökümü (döneme paylaştırılmış)" />
          <div className="mt-3 flex flex-wrap gap-3 text-[13px]">{Object.entries(d.analysis.finans[0].isletmeGideriDokumu).map(([k, v]) => <span key={k} className="rounded-lg bg-[#FAFAFD] px-3 py-2"><span className="text-gray-500">{EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k}: </span><b>{money(v)}</b></span>)}</div></section>
      )}
    </FinanceBg>
  );
}
