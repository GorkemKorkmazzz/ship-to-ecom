import { hasModule } from "@/lib/access";
import Link from "next/link";
import { saveStockSettings } from "@/app/actions";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge, SyncButton } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; q?: string; f?: string }> }) {
  const user = await requireUser();
  const smart = hasModule(user, "dagitim");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const stores = await getStores(user.id);
  const [shared, variants, settings] = await Promise.all([
    db.sharedItem.findMany({ where: { userId: user.id } }),
    db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } }),
    db.skuSetting.findMany({ where: { userId: user.id } }),
  ]);
  const setMap = new Map(settings.map((s) => [s.sku, s]));

  type Row = { sku: string; name: string; shared: number | null; per: (number | null)[]; dup: boolean; excluded: boolean; low: boolean };
  const rows = new Map<string, Row>();
  for (const v of variants) {
    const i = stores.findIndex((s) => s.id === v.storeId);
    const r = rows.get(v.matchSku) ?? { sku: v.matchSku, name: v.productName, shared: null, per: stores.map(() => null), dup: false, excluded: !!setMap.get(v.matchSku)?.excluded, low: false };
    r.per[i] = v.currentStock;
    r.dup ||= v.duplicateSku;
    rows.set(v.matchSku, r);
  }
  for (const s of shared) {
    const r = rows.get(s.sku);
    if (!r) continue;
    r.shared = s.sharedStock;
    const threshold = setMap.get(s.sku)?.lowStockThreshold ?? user.lowStockThreshold;
    r.low = threshold !== null && s.sharedStock <= threshold;
  }
  let list = [...rows.values()].sort((a, b) => a.sku.localeCompare(b.sku, "tr"));
  const unmatched = list.filter((r) => r.shared === null && !r.excluded).length;
  const lowCount = list.filter((r) => r.low).length;
  if (q) list = list.filter((r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  if (sp.f === "eslesmeyen") list = list.filter((r) => r.shared === null && !r.excluded);
  if (sp.f === "tukenen") list = list.filter((r) => r.shared !== null && r.shared <= 0);
  if (sp.f === "dusuk") list = list.filter((r) => r.low);
  if (sp.f === "haric") list = list.filter((r) => r.excluded);
  const total = list.length;
  list = list.slice(0, 500);

  return (
    <>
      <PageHeader title="Stok" desc={`${rows.size} SKU · ${unmatched} eşleşmeyen · ${lowCount} düşük stokta`}>
        <SyncButton path="/stok" />
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <details className="card mb-5" open={user.safetyStock > 0 || user.lowStockThreshold !== null || user.criticalStock !== null || stores.some((s) => s.stockSharePercent !== 100 || s.minStock > 0)}>
        <summary className="cursor-pointer font-semibold">Stok ayarları ve akıllı dağıtım</summary>
        <form action={saveStockSettings} className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Güvenlik stoğu (adet)</span>
              <input className="input" name="safetyStock" inputMode="numeric" defaultValue={user.safetyStock} />
              <span className="mt-1 block text-xs text-gray-500">Bu kadar adet mağazalarda satışa açılmaz; aynı anda iki mağazada satış olursa fazla satışı önler.</span>
            </label>
            <label className="block">
              <span className="label">Düşük stok eşiği (adet)</span>
              <input className="input" name="lowStockThreshold" inputMode="numeric" defaultValue={user.lowStockThreshold ?? ""} placeholder="Kapalı" />
              <span className="mt-1 block text-xs text-gray-500">Ortak stok bu değere inince uyarı verilir. Boş bırakılırsa kapalı.</span>
            </label>
            {smart && (
              <>
            <label className="block">
              <span className="label">Kritik stok seviyesi (adet)</span>
              <input className="input" name="criticalStock" inputMode="numeric" defaultValue={user.criticalStock ?? ""} placeholder="Kapalı" />
              <span className="mt-1 block text-xs text-gray-500">Satılabilir stok bu değere inince ürün yalnızca öncelikli mağazada satışa açık kalır; aynı son adet iki mağazada satılamaz.</span>
            </label>
            <label className="block">
              <span className="label">Öncelikli mağaza</span>
              <select className="input" name="priorityStoreId" defaultValue={user.priorityStoreId ?? ""}>
                <option value="">Seçilmedi</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <span className="mt-1 block text-xs text-gray-500">Kritik stokta satışa devam eden mağaza.</span>
            </label>
              </>
            )}
          </div>
          {!smart && <p className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">Mağaza başına minimum stok, öncelikli mağaza ve kritik stok modu Profesyonel paketinde. <Link href="/lisans" className="font-medium underline">Paketi yükselt</Link></p>}
          <h3 className="mt-6 text-sm font-semibold text-gray-700">Mağaza bazlı dağıtım</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {stores.map((s, i) => (
              <fieldset key={s.id} className="rounded-lg border border-gray-200 p-3">
                <legend className="px-1"><StoreBadge label={s.label} index={i} />{user.priorityStoreId === s.id && <span className="badge ml-1 bg-indigo-100 text-indigo-700">Öncelikli</span>}</legend>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="label">Pay (%)</span>
                    <input className="input" name={`share_${s.id}`} inputMode="numeric" defaultValue={s.stockSharePercent} />
                  </label>
                  {smart && (
                    <label className="block">
                      <span className="label">Minimum stok</span>
                      <input className="input" name={`min_${s.id}`} inputMode="numeric" defaultValue={s.minStock} />
                    </label>
                  )}
                </div>
                <span className="mt-1 block text-xs text-gray-500">Pay: ortak stoğun bu mağazada görünen kısmı. Minimum: stok yetiyorsa bu mağazaya en az bu kadar yazılır.</span>
              </fieldset>
            ))}
          </div>
          <button className="btn mt-4">Kaydet ve uygula</button>
        </form>
      </details>

      <form className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={sp.q ?? ""} placeholder="SKU veya ürün adı ara" />
        <select className="input max-w-[12rem]" name="f" defaultValue={sp.f ?? ""}>
          <option value="">Tümü</option>
          <option value="dusuk">Düşük stoktakiler</option>
          <option value="tukenen">Stoğu tükenenler</option>
          <option value="eslesmeyen">Eşleşmeyenler</option>
          <option value="haric">Senkron dışı</option>
        </select>
        <button className="btn-ghost">Filtrele</button>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="th">SKU</th>
              <th className="th">Ürün</th>
              <th className="th text-right">Ortak stok</th>
              {stores.map((s, i) => (
                <th key={s.id} className="th text-right"><StoreBadge label={s.label} index={i} /></th>
              ))}
              <th className="th">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((r) => (
              <tr key={r.sku} className="hover:bg-gray-50">
                <td className="td whitespace-nowrap font-mono text-xs">
                  <Link className="text-indigo-700 hover:underline" href={`/stok/detay?sku=${encodeURIComponent(r.sku)}`}>{r.sku}</Link>
                </td>
                <td className="td">{r.name}</td>
                <td className={`td text-right font-semibold tabular-nums ${r.shared !== null && r.shared <= 0 ? "text-red-600" : r.low ? "text-amber-600" : ""}`}>{r.shared ?? "—"}</td>
                {r.per.map((n, i) => (
                  <td key={i} className="td text-right tabular-nums text-gray-600">{n ?? "—"}</td>
                ))}
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {r.dup ? (
                      <span className="badge bg-red-100 text-red-700">Tekrarlı SKU</span>
                    ) : r.excluded ? (
                      <span className="badge bg-gray-200 text-gray-700">Senkron dışı</span>
                    ) : r.shared !== null ? (
                      <span className="badge bg-emerald-100 text-emerald-700">Eşleşti</span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-600">Tek mağazada</span>
                    )}
                    {r.low && <span className="badge bg-amber-100 text-amber-800">Düşük stok</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr><td className="td py-8 text-center text-gray-500" colSpan={4 + stores.length}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > list.length && <p className="mt-2 text-xs text-gray-500">İlk {list.length} / {total} kayıt gösteriliyor; aramayı daraltın.</p>}
    </>
  );
}
