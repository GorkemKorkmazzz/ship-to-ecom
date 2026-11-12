import { PLANS, planById } from "@/lib/plans";
import { Flash, fmtDate } from "../../../(panel)/ui";
import { updateAccount } from "../../actions";
import { STATUS, loadAccounts } from "../data";

const day = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d) : "");

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; q?: string; durum?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const { rows } = await loadAccounts();
  let shown = q ? rows.filter((r) => r.u.email.toLowerCase().includes(q) || r.u.stores.some((s) => s.storeName.includes(q) || s.label.toLowerCase().includes(q))) : rows;
  if (sp.durum && STATUS[sp.durum]) shown = shown.filter((r) => r.status === sp.durum);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Hesaplar ve paketler <span className="text-base font-normal text-gray-400">({shown.length})</span></h1>
        <form className="flex flex-wrap gap-2">
          <select className="input w-40" name="durum" defaultValue={sp.durum ?? ""}>
            <option value="">Tüm durumlar</option>
            {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input className="input w-64" name="q" defaultValue={sp.q ?? ""} placeholder="E-posta veya mağaza ara" />
          <button className="btn-ghost">Filtrele</button>
        </form>
      </div>
      <Flash ok={sp.ok} hata={sp.hata} />

      <div className="space-y-3">
        {shown.map(({ u, status }) => {
          const [label, cls] = STATUS[status];
          const skus = u.stores.reduce((a, s) => a + s._count.variants, 0);
          const orders = u.stores.reduce((a, s) => a + s._count.orders, 0);
          const limit = planById(u.plan)?.skuLimit;
          return (
            <div key={u.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{u.email}</span>
                    <span className={`badge ${cls}`}>{label}</span>
                    <span className="badge bg-indigo-100 text-indigo-700">{planById(u.plan)?.name ?? u.plan} · {u.billingPeriod === "yillik" ? "yıllık" : "aylık"}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Kayıt: {fmtDate(u.createdAt)} · Son senkron: {fmtDate(u.lastSyncAt)}
                    {status === "deneme" && u.trialEndsAt ? ` · Deneme bitişi: ${fmtDate(u.trialEndsAt)}` : ""}
                    {u.paidUntil ? ` · Ödeme bitişi: ${fmtDate(u.paidUntil)}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Mağazalar: {u.stores.length ? u.stores.map((s) => `${s.label} (${s.storeName})`).join(", ") : "yok"}
                  </div>
                </div>
                <dl className="flex gap-6 text-right text-sm">
                  <div><dt className="text-xs text-gray-500">Varyant</dt><dd className="font-semibold tabular-nums">{skus}</dd></div>
                  <div>
                    <dt className="text-xs text-gray-500">Ortak SKU</dt>
                    <dd className={`font-semibold tabular-nums ${limit && u._count.sharedItems > limit ? "text-red-600" : ""}`}>{u._count.sharedItems}{limit ? <span className="font-normal text-gray-400"> / {limit}</span> : null}</dd>
                  </div>
                  <div><dt className="text-xs text-gray-500">Sipariş</dt><dd className="font-semibold tabular-nums">{orders}</dd></div>
                </dl>
              </div>
              <form action={updateAccount} className="mt-3 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
                <input type="hidden" name="id" value={u.id} />
                <label className="block">
                  <span className="label">Paket</span>
                  <select className="input" name="plan" defaultValue={u.plan}>
                    {PLANS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Dönem</span>
                  <select className="input" name="period" defaultValue={u.billingPeriod}>
                    <option value="aylik">Aylık</option>
                    <option value="yillik">Yıllık</option>
                  </select>
                </label>
                <label className="block">
                  <span className="label">Ödeme bitiş tarihi</span>
                  <input className="input" type="date" name="paidUntil" defaultValue={day(u.paidUntil)} />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <input type="checkbox" name="suspended" defaultChecked={u.suspended} /> Askıya al
                </label>
                <button className="btn-ghost">Kaydet</button>
              </form>
            </div>
          );
        })}
        {!shown.length && <p className="card text-center text-sm text-gray-500">Hesap bulunamadı.</p>}
      </div>
    </>
  );
}
