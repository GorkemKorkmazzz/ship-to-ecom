import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../thumb";
import { loadFinance } from "../load";
import { FinanceBg, FinanceShell, type FinParams } from "../shell";
import { CardTitle, Empty, I, card, fmtMoneyFn, fmtNum, fmtPct } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const { range, d } = await loadFinance(user.id, sp);
  const money = fmtMoneyFn(d.currency, 0);
  const katki = new Map((d.finance?.products ?? []).map((p) => [p.key, p]));
  const rows = d.prods.map((p) => ({ ...p, f: katki.get(p.sku) })).sort((a, b) => (b.f?.contribution ?? b.kar ?? -1e12) - (a.f?.contribution ?? a.kar ?? -1e12));
  return (
    <FinanceBg>
      <FinanceShell base="/finans/urun" title="Ürün Kârlılığı" desc="Her ürünün net satışı, maliyeti, brüt kârı, ürüne dağıtılan giderleri, reklamı ve katkı kârı" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <section className={`${card} overflow-hidden`}>
        <div className="px-5 pt-5"><CardTitle icon={<I d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />} title={`Ürünler (${rows.length})`} /></div>
        {rows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-[#FAFAFD] text-left text-xs text-gray-500"><tr>{["Ürün", "Satış Adedi", "Net Ciro", "Maliyet", "Brüt Kâr", "Marj", "Dağıtılan Gider", "Reklam", "Katkı Kârı", "İade Adedi"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#F1F0F7]">
                {rows.map((p) => (
                  <tr key={p.sku}>
                    <td className="px-3 py-2"><span className="flex items-center gap-2.5"><Thumb src={p.image} alt={p.ad} size={32} /><span className="min-w-0"><span className="block max-w-[260px] truncate font-medium text-[#1E1B4B]" title={p.ad}>{p.ad}</span><span className="font-mono text-[11px] text-gray-400">{p.sku}</span></span></span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.adet)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.ciro)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.maliyet === null ? <span className="text-amber-700">eksik</span> : money(p.maliyet)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.kar !== null && p.kar < 0 ? "text-red-600" : ""}`}>{p.kar === null ? "—" : money(p.kar)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(p.marj)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.f?.allocatedExpenses ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.f?.adSpend ?? 0)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.f?.contribution == null ? <span className="font-normal text-gray-400">—</span> : <span className={p.f.contribution < 0 ? "text-red-600" : "text-emerald-600"}>{money(p.f.contribution)}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.iadeAdet)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-5"><Empty text="Bu dönemde satılan ürün yok." /></div>}
        <p className="px-5 pb-4 pt-2 text-[11px] text-gray-400">Maliyet sipariş anındaki maliyettir; maliyeti eksik üründe brüt ve katkı kârı hesaplanmaz. Dağıtılan gider: siparişe bağlı satış giderlerinin seçilen yöntemle ürüne düşen payı. Reklam: yalnızca platformun ürün kırılımıyla kesin eşleşen harcama.</p>
      </section>
    </FinanceBg>
  );
}
