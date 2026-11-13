import Link from "next/link";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../thumb";
import { Flash, PageHeader, StoreBadge, SyncButton, fmtDate, fmtMoney } from "../../ui";
import { OrderTabs } from "../tabs";

type Line = { name: string; sku: string; imageId: string | null; quantity: number; price: number | null };
const FILTERS = [["", "Tümü"], ["acik", "Kurtarılmayı bekleyen"], ["kurtarildi", "Kurtarılan"]] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; magaza?: string; durum?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);
  const selected = stores.find((s) => s.id === sp.magaza);
  const all = await db.abandonedCart.findMany({
    where: { storeId: selected ? selected.id : { in: stores.map((s) => s.id) } },
    orderBy: { lastActivityAt: "desc" },
    take: 500,
  });
  const recovered = (c: (typeof all)[number]) => c.recoveryStatus === "RECOVERED" || c.status === "COMPLETED";
  const waiting = all.filter((c) => !recovered(c));
  const won = all.filter(recovered);
  const list = sp.durum === "acik" ? waiting : sp.durum === "kurtarildi" ? won : all;
  const currency = all[0]?.currency ?? "TRY";
  const sum = (xs: typeof all) => xs.reduce((a, c) => a + c.total, 0);

  const link = (patch: { magaza?: string | null; durum?: string }) => {
    const p = new URLSearchParams();
    const magaza = patch.magaza === undefined ? selected?.id : patch.magaza;
    const durum = patch.durum === undefined ? sp.durum : patch.durum;
    if (magaza) p.set("magaza", magaza);
    if (durum) p.set("durum", durum);
    const s = p.toString();
    return s ? `/siparisler/sepetler?${s}` : "/siparisler/sepetler";
  };
  const pill = (active: boolean) => `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;
  const kpis = [
    ["Kurtarılmayı bekleyen sepet", String(waiting.length)],
    ["Bekleyen tutar", fmtMoney(sum(waiting), currency)],
    ["Kurtarılan sepet", String(won.length)],
    ["Kurtarma oranı", all.length ? `%${Math.round((won.length / all.length) * 100)}` : "—"],
  ];

  return (
    <>
      <PageHeader title="Siparişler" desc="Sepete ürün ekleyip ödemeyi tamamlamayan ziyaretler · müşteri bilgileri alınmaz">
        <SyncButton path="/siparisler/sepetler" />
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />
      <OrderTabs active="sepetler" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ magaza: null })} className={pill(!selected)}>Tüm mağazalar</Link>
          {stores.map((s) => <Link key={s.id} href={link({ magaza: s.id })} className={pill(selected?.id === s.id)}>{s.label}</Link>)}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          {FILTERS.map(([key, label]) => <Link key={key} href={link({ durum: key })} className={pill((sp.durum ?? "") === key)}>{label}</Link>)}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="th">Sepet</th>
              <th className="th">Mağaza</th>
              <th className="th">Son hareket</th>
              <th className="th">Durum</th>
              <th className="th">İl</th>
              <th className="th text-right">Tutar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((c) => {
              const i = stores.findIndex((s) => s.id === c.storeId);
              const lines: Line[] = JSON.parse(c.linesJson);
              return (
                <tr key={c.id} className="align-top">
                  <td className="td">
                    <div className="flex items-start gap-3">
                      <div className="flex shrink-0 -space-x-3">
                        {lines.slice(0, 3).map((l, k) => <Thumb key={k} src={imageUrl(stores[i].merchantId, l.imageId)} alt={l.name || l.sku} size={40} />)}
                      </div>
                      <div className="min-w-0">
                        {lines.map((l, k) => (
                          <div key={k} className="truncate text-sm">{l.quantity} × {l.name || "—"} <span className="font-mono text-xs text-gray-400">{l.sku}</span></div>
                        ))}
                        {!lines.length && <span className="text-sm text-gray-500">{c.itemCount} ürün</span>}
                        {c.couponCode && <span className="badge mt-1 bg-amber-100 text-amber-800">Kupon: {c.couponCode}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="td"><StoreBadge label={stores[i].label} index={i} /></td>
                  <td className="td whitespace-nowrap text-gray-600">{fmtDate(c.lastActivityAt)}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      <span className={`badge ${recovered(c) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{recovered(c) ? "Kurtarıldı" : "Bekliyor"}</span>
                      {c.emailStatus === "SENT" && <span className="badge bg-sky-100 text-sky-700">Hatırlatma gönderildi</span>}
                    </div>
                  </td>
                  <td className="td text-gray-600">{c.city ?? "—"}</td>
                  <td className="td whitespace-nowrap text-right font-semibold tabular-nums">{fmtMoney(c.total, c.currency)}</td>
                </tr>
              );
            })}
            {!list.length && <tr><td className="td py-10 text-center text-gray-500" colSpan={6}>Terk edilmiş sepet yok.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">Hatırlatma e-postaları ikas&apos;ın kendi terk edilmiş sepet akışından gönderilir; burada yalnızca durumu görürsünüz.</p>
    </>
  );
}
