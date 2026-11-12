import Link from "next/link";
import { PLANS, planById, tl } from "@/lib/plans";
import { fmtDate } from "../../(panel)/ui";
import { STATUS, loadAccounts } from "./data";

export default async function Page() {
  const { rows, paying, mrr } = await loadAccounts();
  const stores = rows.flatMap((r) => r.u.stores);
  const kpis = [
    ["Toplam hesap", String(rows.length)],
    ["Ödeyen hesap", String(paying.length)],
    ["Denemede", String(rows.filter((r) => r.status === "deneme").length)],
    ["Bağlı mağaza", String(stores.length)],
    ["Aylık gelir (MRR)", tl(mrr)],
  ];
  return (
    <>
      <h1 className="mb-5 text-xl font-semibold tracking-tight">Özet</h1>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([label, value]) => (
          <div key={label} className="card">
            <div className="text-sm text-gray-500">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 font-semibold">Paket dağılımı</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((p) => {
          const all = rows.filter((r) => r.u.plan === p.id);
          return (
            <div key={p.id} className="card flex items-center justify-between">
              <div>
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-gray-500">{tl(p.monthly)} / ay · yıllıkta {tl(p.yearlyMonthly)}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold tabular-nums">{all.length}</div>
                <div className="text-xs text-gray-500">{all.filter((r) => r.status === "odeme").length} ödeyen</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Son kayıtlar</h2>
            <Link href="/backoffice/hesaplar" className="text-sm text-indigo-600 hover:underline">Tümü</Link>
          </div>
          <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {rows.slice(0, 6).map(({ u, status }) => (
              <div key={u.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{u.email}</span>
                <span className="text-xs text-gray-500">{planById(u.plan)?.name}</span>
                <span className={`badge ${STATUS[status][1]}`}>{STATUS[status][0]}</span>
              </div>
            ))}
            {!rows.length && <p className="py-6 text-center text-sm text-gray-500">Henüz hesap yok.</p>}
          </div>
        </section>
        <section className="card">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Hata veren mağazalar</h2>
            <Link href="/backoffice/magazalar" className="text-sm text-indigo-600 hover:underline">Tümü</Link>
          </div>
          <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {stores.filter((s) => s.lastError).slice(0, 6).map((s) => (
              <div key={s.id} className="py-2.5 text-sm">
                <div className="font-medium">{s.label} <span className="font-normal text-gray-400">· {s.storeName}.myikas.com</span></div>
                <div className="truncate text-xs text-red-600" title={s.lastError ?? ""}>{s.lastError}</div>
                <div className="text-xs text-gray-400">Son senkron: {fmtDate(s.lastSyncAt)}</div>
              </div>
            ))}
            {!stores.some((s) => s.lastError) && <p className="py-6 text-center text-sm text-gray-500">Hata veren mağaza yok.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
