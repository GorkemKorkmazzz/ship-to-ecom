import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { loadFinance } from "../load";
import { FinanceBg, FinanceShell, type FinParams } from "../shell";
import { CardTitle, Empty, I, card, fmtMoneyFn, fmtNum, fmtPct } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const { range, d } = await loadFinance(user.id, sp);
  const money = fmtMoneyFn(d.currency);
  const f = d.finance;
  const affected = d.orderRows.filter((o) => o.refunded > 0 || o.cancelled > 0);
  const gross = f?.layers.grossSales.amount ?? 0;
  const products = (f?.products ?? []).filter((p) => p.refundedQty || p.cancelledQty).sort((a, b) => b.refundedQty + b.cancelledQty - (a.refundedQty + a.cancelledQty));
  const dt = (x: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeZone: "Europe/Istanbul" }).format(x);
  const kpis: [string, string, string][] = [
    ["İade tutarı", money(f?.deductions.refunded ?? 0), gross ? `brüt satışın ${fmtPct(((f?.deductions.refunded ?? 0) / gross) * 100)}` : ""],
    ["İptal tutarı", money(f?.deductions.cancelled ?? 0), gross ? `brüt satışın ${fmtPct(((f?.deductions.cancelled ?? 0) / gross) * 100)}` : ""],
    ["Etkilenen sipariş", fmtNum(affected.length), `${fmtNum(f?.refundSource.payments ?? 0)} siparişte iade ödeme kaydından`],
    ["İade kargo gideri", money(f?.expenses.byType.RETURN_SHIPPING ?? 0), "kayıtlı iade kargo giderleri"],
  ];
  return (
    <FinanceBg>
      <FinanceShell base="/finans/iade" title="İade ve İptaller" desc="İade ve iptallerin satışa ve kârlılığa etkisi" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        {kpis.map(([l, v, s]) => <div key={l} className={`${card} p-4`}><div className="text-[13px] text-gray-500">{l}</div><div className="mt-2 text-xl font-bold tabular-nums text-[#1E1B4B]">{v}</div><div className="mt-1 text-[11px] text-gray-400">{s}</div></div>)}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="px-5 pt-5"><CardTitle icon={<I d="M3 12a9 9 0 109-9M3 3v6h6" />} title="İade / iptal içeren siparişler" /></div>
          {affected.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="bg-[#FAFAFD] text-left text-xs text-gray-500"><tr>{["Sipariş", "Tarih", "Durum", "İade", "İptal", "İade kaynağı"].map((h, i) => <th key={h} className={`px-3 py-2.5 font-medium ${i > 2 && i < 5 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-[#F1F0F7]">
                  {affected.slice(0, 200).map((o) => (
                    <tr key={o.id}><td className="px-3 py-2 font-medium text-[#1E1B4B]">#{o.number}</td><td className="px-3 py-2 text-gray-600">{dt(o.at)}</td><td className="px-3 py-2 text-xs text-gray-500">{o.status}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{o.refunded ? money(o.refunded) : "—"}</td><td className="px-3 py-2 text-right tabular-nums">{o.cancelled ? money(o.cancelled) : "—"}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{o.refundSource ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="p-5"><Empty text="Bu dönemde iade ya da iptal yok." /></div>}
        </section>
        <section className={`${card} p-5`}>
          <CardTitle icon={<I d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />} title="En çok iade/iptal edilen ürünler" />
          <ul className="mt-3 space-y-2 text-[13px]">
            {products.slice(0, 10).map((p) => <li key={p.key} className="flex justify-between gap-2"><span className="min-w-0 truncate text-[#1E1B4B]" title={p.name}>{p.name}</span><span className="shrink-0 tabular-nums text-gray-600">{p.refundedQty ? `${fmtNum(p.refundedQty)} iade` : ""}{p.refundedQty && p.cancelledQty ? " · " : ""}{p.cancelledQty ? `${fmtNum(p.cancelledQty)} iptal` : ""}</span></li>)}
            {!products.length && <li><Empty text="İade ya da iptal yok." /></li>}
          </ul>
          <p className="mt-3 text-[11px] text-gray-400">İade ödemesi kaydı olan siparişte tutar ödemeden alınır (kargo iadesi içerebilir); kaydı olmayanda kalem durumundan. Aynı iade iki kez düşülmez.</p>
        </section>
      </div>
    </FinanceBg>
  );
}
