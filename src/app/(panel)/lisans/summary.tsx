import { planById, tl2 } from "@/lib/plans";

export function OrderSummary({ plan, period, amount, vat, total }: { plan: string; period: string; amount: number; vat: number; total: number }) {
  const p = planById(plan);
  return (
    <aside className="card h-fit">
      <h2 className="font-semibold">Sipariş özeti</h2>
      <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2.5">
        <div className="font-semibold text-indigo-900">{p?.name} paketi</div>
        <div className="text-xs text-indigo-700">{period === "yillik" ? "Yıllık lisans (12 ay)" : "Aylık lisans (1 ay)"}</div>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-gray-500">Ara toplam</dt><dd className="tabular-nums">{tl2(amount)}</dd></div>
        <div className="flex justify-between"><dt className="text-gray-500">KDV (%20)</dt><dd className="tabular-nums">{tl2(vat)}</dd></div>
        <div className="flex justify-between border-t border-gray-200 pt-2 text-base font-semibold"><dt>Toplam</dt><dd className="tabular-nums">{tl2(total)}</dd></div>
      </dl>
    </aside>
  );
}

export const PAY_STATUS: Record<string, [string, string]> = {
  bekliyor: ["Ödeme bekleniyor", "bg-amber-100 text-amber-800"],
  bildirildi: ["Onay bekliyor", "bg-sky-100 text-sky-700"],
  odendi: ["Ödendi", "bg-emerald-100 text-emerald-700"],
  iptal: ["İptal", "bg-gray-100 text-gray-600"],
};
