import Link from "next/link";
import { db } from "@/lib/db";
import { listCampaigns, type RemoteCampaign } from "@/lib/ikas";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge, fmtDate } from "../ui";
import { createCampaign, removeCampaign } from "./actions";

const TYPE: Record<string, string> = {
  RATIO: "Yüzde indirimi",
  FIXED_AMOUNT: "Tutar indirimi",
  FREE_SHIPPING: "Ücretsiz kargo",
  BUY_X_THEN_GET_Y: "X al Y öde",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!stores.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">İndirim oluşturmak için önce mağaza bağlayın.</p>
        <Link href="/magazalar" className="btn mt-4">Mağaza bağla</Link>
      </div>
    );
  }

  // Kampanyalar doğrudan ikas'tan okunur; aynı ad + türdekiler tek satırda birleştirilir.
  const lists = await Promise.allSettled(stores.map((s) => listCampaigns(s)));
  const errors = lists.flatMap((l, i) => (l.status === "rejected" ? [`${stores[i].label}: ${l.reason instanceof Error ? l.reason.message : l.reason}`] : []));
  type Group = { c: RemoteCampaign; usage: number; in: { storeIndex: number; storeId: string; id: string }[] };
  const groups = new Map<string, Group>();
  lists.forEach((l, i) => {
    if (l.status !== "fulfilled") return;
    for (const c of l.value) {
      const key = `${c.type}|${c.title.toLocaleLowerCase("tr")}`;
      const g = groups.get(key) ?? { c, usage: 0, in: [] };
      g.usage += c.usageCount;
      g.in.push({ storeIndex: i, storeId: stores[i].id, id: c.id });
      groups.set(key, g);
    }
  });
  const now = new Date().getTime();
  const status = (c: RemoteCampaign) => {
    if (c.dateRange?.end && c.dateRange.end < now) return ["Süresi doldu", "bg-gray-100 text-gray-600"];
    if (c.dateRange?.start && c.dateRange.start > now) return ["Planlandı", "bg-sky-100 text-sky-700"];
    if (c.usageLimit && c.usageCount >= c.usageLimit) return ["Limit doldu", "bg-gray-100 text-gray-600"];
    return ["Aktif", "bg-emerald-100 text-emerald-700"];
  };
  const value = (c: RemoteCampaign) =>
    c.type === "RATIO" ? `%${c.fixedDiscount?.amount ?? "—"}` : c.type === "FIXED_AMOUNT" ? `${c.fixedDiscount?.amount ?? "—"} ₺` : "—";

  return (
    <>
      <PageHeader title="İndirimler" desc="Kampanyalar ikas'ın kampanya modülünde oluşturulur; sepette ikas uygular." />
      <Flash ok={sp.ok} hata={sp.hata ?? (errors.length ? errors.join(" · ") : undefined)} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="th">Kampanya</th>
                <th className="th">Değer</th>
                <th className="th">Mağazalar</th>
                <th className="th">Tarih</th>
                <th className="th text-right">Kullanım</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...groups.values()].map((g) => {
                const [label, cls] = status(g.c);
                return (
                  <tr key={g.in[0].id}>
                    <td className="td">
                      <div className="font-medium">{g.c.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs text-gray-500">
                        {TYPE[g.c.type] ?? g.c.type}
                        {g.c.hasCoupon && <span className="badge bg-amber-100 text-amber-800">Kuponlu</span>}
                        <span className={`badge ${cls}`}>{label}</span>
                      </div>
                    </td>
                    <td className="td whitespace-nowrap font-semibold tabular-nums">{value(g.c)}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {g.in.map((x) => <StoreBadge key={x.storeId} label={stores[x.storeIndex].label} index={x.storeIndex} />)}
                      </div>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-gray-600">
                      {g.c.dateRange?.start || g.c.dateRange?.end ? (
                        <>
                          {g.c.dateRange?.start ? fmtDate(new Date(g.c.dateRange.start)) : "…"}
                          <br />
                          {g.c.dateRange?.end ? fmtDate(new Date(g.c.dateRange.end)) : "süresiz"}
                        </>
                      ) : (
                        "Süresiz"
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {g.usage}
                      {g.c.usageLimit ? <span className="text-gray-400"> / {g.c.usageLimit}</span> : null}
                    </td>
                    <td className="td text-right">
                      <form action={removeCampaign}>
                        <input type="hidden" name="targets" value={JSON.stringify(g.in.map(({ storeId, id }) => ({ storeId, id })))} />
                        <button className="btn-ghost text-red-600">Sil</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {!groups.size && (
                <tr><td className="td py-8 text-center text-gray-500" colSpan={6}>Henüz kampanya yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={createCampaign} className="card space-y-4">
          <h2 className="font-semibold">Yeni kampanya</h2>
          <label className="block">
            <span className="label">Kampanya adı *</span>
            <input className="input" name="title" required placeholder="Örn. Kasım indirimi" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Tür</span>
              <select className="input" name="type" defaultValue="RATIO">
                <option value="RATIO">Yüzde indirimi</option>
                <option value="FIXED_AMOUNT">Tutar indirimi</option>
                <option value="FREE_SHIPPING">Ücretsiz kargo</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Değer</span>
              <input className="input" name="amount" inputMode="decimal" placeholder="10" />
            </label>
          </div>
          <label className="block">
            <span className="label">Kupon kodu</span>
            <input className="input font-mono uppercase" name="code" placeholder="Boşsa otomatik uygulanır" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Başlangıç</span>
              <input className="input" type="datetime-local" name="start" />
            </label>
            <label className="block">
              <span className="label">Bitiş</span>
              <input className="input" type="datetime-local" name="end" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Toplam kullanım limiti</span>
              <input className="input" name="usageLimit" inputMode="numeric" placeholder="Sınırsız" />
            </label>
            <label className="block">
              <span className="label">Müşteri başına limit</span>
              <input className="input" name="usageLimitPerCustomer" inputMode="numeric" placeholder="Sınırsız" />
            </label>
          </div>
          <label className="block">
            <span className="label">Hangi fiyata uygulansın</span>
            <select className="input" name="applicablePrice" defaultValue="SELL_PRICE">
              <option value="SELL_PRICE">Satış fiyatı</option>
              <option value="DISCOUNT_PRICE">İndirimli fiyat</option>
            </select>
          </label>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="includeDiscounted" defaultChecked /> İndirimli ürünlerde de geçerli</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="combine" /> Diğer kampanyalarla birleşebilir</label>
          </div>
          <div className="space-y-2 border-t border-gray-100 pt-3 text-sm">
            <span className="label">Mağazalar</span>
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" name="storeIds" value={s.id} defaultChecked /> {s.label}
              </label>
            ))}
          </div>
          <button className="btn w-full">Kampanyayı oluştur</button>
          <p className="text-xs text-gray-500">Tarihler Türkiye saatiyledir. Kampanya tüm ürünlerde geçerli olur.</p>
        </form>
      </div>
    </>
  );
}
