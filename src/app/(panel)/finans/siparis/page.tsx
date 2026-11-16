import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { loadFinance } from "../load";
import { FinanceBg, FinanceShell, type FinParams } from "../shell";
import { CardTitle, Empty, I, card, fmtMoneyFn } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const { range, d } = await loadFinance(user.id, sp);
  const money = fmtMoneyFn(d.currency);
  const rows = d.orderRows.slice(0, 300);
  const dt = (x: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(x);
  return (
    <FinanceBg>
      <FinanceShell base="/finans/siparis" title="Sipariş Finansalları" desc="Her siparişin net satışı, ürün maliyeti, giderleri ve katkısı" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <section className={`${card} overflow-hidden`}>
        <div className="px-5 pt-5"><CardTitle icon={<I d="M3 4h2l2.5 11h10L20 7H6.5" />} title={`Siparişler (${d.orderRows.length})`} /></div>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[960px] text-[13px]">
              <thead className="bg-[#FAFAFD] text-left text-xs text-gray-500"><tr>{["Sipariş", "Tarih", "Mağaza", "Durum", "Sipariş Toplamı", "Net Satış", "Ürün Maliyeti", "Satış Gideri", "İade / İptal", "Katkı"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-medium ${i > 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#F1F0F7]">
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="px-3 py-2 font-medium text-[#1E1B4B]">#{o.number}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{dt(o.at)}</td>
                    <td className="px-3 py-2 text-gray-600">{o.store}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{o.status}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(o.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(o.net)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.cost === null ? <span className="text-amber-700">eksik</span> : <>{money(o.cost)}{o.costState === "partial" && <span className="ml-1 text-[10px] text-amber-700">kısmi</span>}</>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.expenses === null ? <span className="text-gray-400">kayıt yok</span> : money(o.expenses)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.refunded + o.cancelled ? <span className="text-red-600">−{money(o.refunded + o.cancelled)}</span> : "—"}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{o.contribution === null ? <span className="font-normal text-gray-400">—</span> : <span className={o.contribution < 0 ? "text-red-600" : "text-emerald-600"}>{money(o.contribution)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-5"><Empty text="Seçili filtrede sipariş yok." /></div>}
        <p className="px-5 pb-4 pt-2 text-[11px] text-gray-400">Katkı = net satış − ürün maliyeti − siparişe bağlı kayıtlı satış giderleri (reklam ve işletme giderleri sipariş bazında dağıtılmaz). Maliyeti eksik siparişte gösterilmez.{d.orderRows.length > rows.length ? ` İlk ${rows.length} sipariş gösteriliyor.` : ""}</p>
      </section>
    </FinanceBg>
  );
}
