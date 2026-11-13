import Link from "next/link";
import { adjustStock, saveSkuSettings } from "@/app/actions";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge, fmtDate } from "../../ui";

const REASON: Record<string, [string, string]> = {
  sale: ["Satış / stok düşüşü", "bg-sky-100 text-sky-700"],
  increase: ["Stok girişi / iade", "bg-emerald-100 text-emerald-700"],
  panel: ["Panel düzeltmesi", "bg-amber-100 text-amber-800"],
  link: ["Ortak stoğa bağlandı", "bg-gray-100 text-gray-700"],
};

export default async function Page({ searchParams }: { searchParams: Promise<{ sku?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sku = sp.sku ?? "";
  const stores = await getStores(user.id);
  const [variants, item, setting, movements] = await Promise.all([
    db.storeVariant.findMany({ where: { matchSku: sku, storeId: { in: stores.map((s) => s.id) } } }),
    db.sharedItem.findUnique({ where: { userId_sku: { userId: user.id, sku } } }),
    db.skuSetting.findUnique({ where: { userId_sku: { userId: user.id, sku } } }),
    db.stockMovement.findMany({ where: { userId: user.id, sku }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  if (!variants.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">Bu SKU bulunamadı.</p>
        <Link href="/stok" className="btn mt-4">Stok listesine dön</Link>
      </div>
    );
  }

  return (
    <>
      <PageHeader title={variants[0].productName} desc={`SKU ${sku}`}>
        <Link href="/stok" className="btn-ghost">← Stok listesi</Link>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="card">
              <div className="text-sm text-gray-500">Ortak stok</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums">{item ? item.sharedStock : "—"}</div>
              {!item && <div className="mt-1 text-xs text-gray-500">{setting?.excluded ? "Senkron dışı" : "Henüz eşleşmedi"}</div>}
            </div>
            {stores.map((s, i) => {
              const v = variants.find((x) => x.storeId === s.id);
              return (
                <div key={s.id} className="card">
                  <StoreBadge label={s.label} index={i} />
                  <div className="mt-2 text-3xl font-semibold tabular-nums">{v ? v.currentStock : "—"}</div>
                  <div className="mt-1 text-xs text-gray-500">{v ? "mağazada görünen" : "bu mağazada yok"}</div>
                </div>
              );
            })}
          </section>

          <section className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Stok hareketleri</h2>
            <table className="mt-3 w-full">
              <thead className="border-y border-gray-200 bg-gray-50">
                <tr>
                  <th className="th">Zaman</th>
                  <th className="th">Hareket</th>
                  <th className="th">Mağaza</th>
                  <th className="th text-right">Değişim</th>
                  <th className="th text-right">Ortak stok</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((m) => {
                  const [label, cls] = REASON[m.reason] ?? [m.reason, "bg-gray-100 text-gray-700"];
                  return (
                    <tr key={m.id}>
                      <td className="td whitespace-nowrap text-gray-600">{fmtDate(m.createdAt)}</td>
                      <td className="td">
                        <span className={`badge ${cls}`}>{label}</span>
                        {m.note && <span className="ml-2 text-xs text-gray-500">{m.note}</span>}
                      </td>
                      <td className="td">{m.storeLabel ?? "—"}</td>
                      <td className={`td text-right font-medium tabular-nums ${m.delta < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</td>
                      <td className="td text-right tabular-nums">{m.sharedAfter}</td>
                    </tr>
                  );
                })}
                {!movements.length && (
                  <tr><td className="td py-8 text-center text-gray-500" colSpan={5}>Henüz hareket yok.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <div className="space-y-5">
          {item && (
            <form action={adjustStock} className="card space-y-3">
              <h2 className="font-semibold">Stoğu düzelt</h2>
              <input type="hidden" name="sku" value={sku} />
              <label className="block">
                <span className="label">Yeni ortak stok</span>
                <input className="input" name="stock" inputMode="numeric" defaultValue={item.sharedStock} required />
              </label>
              <label className="block">
                <span className="label">Not</span>
                <input className="input" name="note" placeholder="Örn. sayım farkı, yeni sevkiyat" />
              </label>
              <button className="btn w-full">Güncelle ve mağazalara yaz</button>
            </form>
          )}

          <form action={saveSkuSettings} className="card space-y-3">
            <h2 className="font-semibold">Bu SKU&apos;ya özel ayarlar</h2>
            <input type="hidden" name="sku" value={sku} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="excluded" defaultChecked={setting?.excluded} className="mt-1" />
              <span>
                Ortak stok senkronu dışında tut
                <span className="block text-xs text-gray-500">Her mağaza kendi stoğunu kullanır; mağaza stoklarına dokunulmaz.</span>
              </span>
            </label>
            <label className="block">
              <span className="label">Güvenlik stoğu</span>
              <input className="input" name="safetyStock" inputMode="numeric" defaultValue={setting?.safetyStock ?? ""} placeholder={`Genel ayar (${user.safetyStock})`} />
            </label>
            <label className="block">
              <span className="label">Düşük stok eşiği</span>
              <input className="input" name="lowStockThreshold" inputMode="numeric" defaultValue={setting?.lowStockThreshold ?? ""} placeholder={`Genel ayar (${user.lowStockThreshold ?? "kapalı"})`} />
            </label>
            <button className="btn-ghost w-full">Ayarları kaydet</button>
          </form>
        </div>
      </div>
    </>
  );
}
