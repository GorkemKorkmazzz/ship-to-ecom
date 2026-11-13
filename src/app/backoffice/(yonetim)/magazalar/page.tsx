import { storeHost } from "@/lib/platforms";
import { planById } from "@/lib/plans";
import { fmtDate } from "../../../(panel)/ui";
import { STATUS, loadAccounts } from "../data";

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { rows } = await loadAccounts();
  let stores = rows.flatMap((r) => r.u.stores.map((s) => ({ s, u: r.u, status: r.status })));
  if (q) stores = stores.filter((x) => x.s.storeName.includes(q) || x.s.label.toLowerCase().includes(q) || x.u.email.toLowerCase().includes(q));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Mağazalar <span className="text-base font-normal text-gray-400">({stores.length})</span></h1>
        <form className="flex gap-2">
          <input className="input w-64" name="q" defaultValue={sp.q ?? ""} placeholder="Mağaza veya e-posta ara" />
          <button className="btn-ghost">Ara</button>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="th">Mağaza</th>
              <th className="th">Hesap</th>
              <th className="th">Paket</th>
              <th className="th text-right">Varyant</th>
              <th className="th text-right">Sipariş</th>
              <th className="th">Son senkron</th>
              <th className="th">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stores.map(({ s, u, status }) => (
              <tr key={s.id}>
                <td className="td">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-gray-400">{storeHost(s)}</div>
                </td>
                <td className="td">{u.email}</td>
                <td className="td whitespace-nowrap">
                  {planById(u.plan)?.name} <span className={`badge ml-1 ${STATUS[status][1]}`}>{STATUS[status][0]}</span>
                </td>
                <td className="td text-right tabular-nums">{s._count.variants}</td>
                <td className="td text-right tabular-nums">{s._count.orders}</td>
                <td className="td whitespace-nowrap text-gray-600">{fmtDate(s.lastSyncAt)}</td>
                <td className="td">
                  <span className={`badge ${s.lastError ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{s.lastError ? "Hata" : "Bağlı"}</span>
                  <span className="badge ml-1 bg-gray-100 text-gray-600">webhook {s.webhooksActive ? "açık" : "kapalı"}</span>
                  {s.lastError && <div className="mt-1 max-w-xs truncate text-xs text-red-600" title={s.lastError}>{s.lastError}</div>}
                </td>
              </tr>
            ))}
            {!stores.length && (
              <tr><td className="td py-8 text-center text-gray-500" colSpan={7}>Mağaza bulunamadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
