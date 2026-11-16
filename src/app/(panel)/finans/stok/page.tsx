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
  const s = d.stock;
  const kpis: [string, string, string][] = [
    ["Toplam Stok", `${fmtNum(s.units)} Adet`, s.unknownUnits ? `${fmtNum(s.unknownUnits)} adedin maliyeti bilinmiyor` : "tüm stokun maliyeti biliniyor"],
    ["Stok Değeri", money(s.value), "güncel birim maliyetle"],
    ["Kritik Stok", `${fmtNum(s.critical)} Ürün`, "tükenen, eşiğin altında ya da 7 günden kısa"],
    ["Tahmini Süre", s.days === null ? "Satış yok" : `${fmtNum(s.days)} Gün`, "dönemin günlük satış hızıyla"],
  ];
  return (
    <FinanceBg>
      <FinanceShell base="/finans/stok" title="Stok ve Sermaye" desc="Stokta bağlı sermaye, ürün bazında stok değeri ve tükenme süresi" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        {kpis.map(([l, v, t]) => <div key={l} className={`${card} p-4`}><div className="text-[13px] text-gray-500">{l}</div><div className="mt-2 text-xl font-bold tabular-nums text-[#1E1B4B]">{v}</div><div className="mt-1 text-[11px] text-gray-400">{t}</div></div>)}
      </div>
      <section className={`${card} mt-4 p-5`}>
        <div className="flex justify-between text-[13px]"><span className="font-semibold text-[#1E1B4B]">Stokta Bağlı Sermaye</span><span className="font-bold tabular-nums">{money(s.value)}</span></div>
        <div className="mt-2 h-2 rounded-full bg-[#F1EDFF]"><div className="h-2 rounded-full bg-[#633BFF]" style={{ width: `${Math.max(2, s.costKnownShare ?? 0)}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-gray-400">Çubuk: maliyeti bilinen stok oranı ({fmtPct(s.costKnownShare, 0)}). {s.basis}</p>
      </section>
      <section className={`${card} mt-4 overflow-hidden`}>
        <div className="px-5 pt-5"><CardTitle icon={<I d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />} title={`Ürün bazında stok (${d.stockRows.length})`} /></div>
        {d.stockRows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-[#FAFAFD] text-left text-xs text-gray-500"><tr>{["Ürün", "Stok", "Birim maliyet", "Stok değeri", "Günlük satış", "Kalan gün"].map((h, i) => <th key={h} className={`px-3 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#F1F0F7]">
                {d.stockRows.map((p) => (
                  <tr key={p.sku}>
                    <td className="px-3 py-2"><span className="flex items-center gap-2.5"><Thumb src={p.image} alt={p.name} size={30} /><span className="min-w-0"><span className="block max-w-[260px] truncate font-medium text-[#1E1B4B]">{p.name}</span><span className="font-mono text-[11px] text-gray-400">{p.sku}</span></span>{p.critical && <span className="rounded bg-red-50 px-1.5 text-[10px] font-semibold text-red-600">Kritik</span>}</span></td>
                    <td className={`px-3 py-2 text-right tabular-nums ${p.stock <= 0 ? "font-semibold text-red-600" : ""}`}>{fmtNum(p.stock)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.unitCost === null ? <span className="text-amber-700">bilinmiyor</span> : money(p.unitCost)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.value === null ? "—" : money(p.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.daily, 2)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.daysLeft === null ? <span className="text-gray-400">satış yok</span> : `${fmtNum(p.daysLeft)} gün`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-5"><Empty text="Stok verisi yok." /></div>}
      </section>
    </FinanceBg>
  );
}
