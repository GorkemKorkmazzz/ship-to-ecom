import { hasModule } from "@/lib/access";
import Link from "next/link";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../thumb";
import { Flash, PageHeader, StoreBadge } from "../../ui";
import { savePrices } from "../actions";
import { saveSkuMeta } from "../tanimlamalar/actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ sku?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sku = sp.sku ?? "";
  const stores = await getStores(user.id);
  const rows = await db.storeVariant.findMany({ where: { matchSku: sku, storeId: { in: stores.map((s) => s.id) } } });
  if (!rows.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">Bu SKU bulunamadı.</p>
        <Link href="/urunler" className="btn mt-4">Ürünlere dön</Link>
      </div>
    );
  }
  const [defs, meta] = await Promise.all([
    db.definition.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.skuSetting.findUnique({ where: { userId_sku: { userId: user.id, sku } } }),
  ]);
  const of = (kind: string) => defs.filter((d) => d.kind === kind);
  let fieldValues: Record<string, string> = {};
  try {
    fieldValues = JSON.parse(meta?.fields ?? "{}");
  } catch {}
  const first = rows[0];
  const firstStore = stores.find((s) => s.id === first.storeId)!;

  return (
    <>
      <PageHeader title={first.productName} desc={`SKU ${sku}`}>
        <div className="flex gap-2">
          <Link href={`/stok/detay?sku=${encodeURIComponent(sku)}`} className="btn-ghost">Stok ve hareketler</Link>
          <Link href="/urunler" className="btn-ghost">← Ürünler</Link>
        </div>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <form action={savePrices} className="card">
        <input type="hidden" name="sku" value={sku} />
        <div className="flex items-center gap-3">
          <Thumb src={imageUrl(firstStore.merchantId, first.imageId)} alt={first.productName} size={56} />
          <div>
            <h2 className="font-semibold">Fiyatlar</h2>
            <p className="text-sm text-gray-500">Değişiklikler doğrudan mağazalara yazılır.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {stores.map((s, i) => {
            const v = rows.find((r) => r.storeId === s.id);
            return (
              <fieldset key={s.id} disabled={!v || s.priceRuleActive} className="rounded-lg border border-gray-200 p-4 disabled:opacity-60">
                <legend className="px-1"><StoreBadge label={s.label} index={i} /></legend>
                {!v ? (
                  <p className="text-sm text-gray-500">Ürün bu mağazada yok.</p>
                ) : (
                  <>
                    {s.priceRuleActive && <p className="mb-3 rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Bu mağazanın fiyatı otomatik fiyat kuralıyla hesaplanıyor.</p>}
                    {v.sku !== sku && <p className="mb-3 text-xs text-gray-500">Bu mağazadaki SKU: <span className="font-mono">{v.sku}</span> (elle eşleştirilmiş)</p>}
                    <div className="grid grid-cols-3 gap-3">
                      <label className="block">
                        <span className="label">Satış</span>
                        <input className="input" name={`sell_${v.id}`} inputMode="decimal" defaultValue={v.sellPrice ?? ""} />
                      </label>
                      <label className="block">
                        <span className="label">İndirimli</span>
                        <input className="input" name={`disc_${v.id}`} inputMode="decimal" defaultValue={v.discountPrice ?? ""} placeholder="yok" />
                      </label>
                      <label className="block">
                        <span className="label">Alış</span>
                        <input className="input" name={`buy_${v.id}`} inputMode="decimal" defaultValue={v.buyPrice ?? ""} placeholder="yok" />
                      </label>
                    </div>
                  </>
                )}
              </fieldset>
            );
          })}
        </div>
        <button className="btn mt-4">Fiyatları kaydet</button>
      </form>

      {hasModule(user, "fiyat") && (
        <form action={saveSkuMeta} className="card mt-5">
          <input type="hidden" name="sku" value={sku} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Tanımlar</h2>
              <p className="text-sm text-gray-500">Kategori, marka ve özel alanlar yalnızca bu panelde saklanır; mağazalara yazılmaz.</p>
            </div>
            <Link href="/urunler/tanimlamalar" className="btn-ghost">Tanımlamaları yönet</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className="label">Kategori</span>
              <select className="input" name="category" defaultValue={meta?.category ?? ""}>
                <option value="">Atanmamış</option>
                {of("category").map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Marka</span>
              <select className="input" name="brand" defaultValue={meta?.brand ?? ""}>
                <option value="">Atanmamış</option>
                {of("brand").map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </label>
            {of("field").map((d) => (
              <label key={d.id} className="block">
                <span className="label">{d.name}</span>
                <input className="input" name={`field_${d.id}`} defaultValue={fieldValues[d.name] ?? ""} maxLength={200} />
              </label>
            ))}
          </div>
          {!defs.length && <p className="mt-3 text-sm text-gray-500">Henüz tanım yok. Önce Tanımlamalar sayfasından kategori, marka ya da özel alan ekleyin.</p>}
          <button className="btn mt-4">Tanımları kaydet</button>
        </form>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Ürün adı, açıklama ve görsel değişiklikleri şimdilik mağaza panelinden yapılmalı; değişiklik bir sonraki senkronda buraya yansır.
      </p>
    </>
  );
}
