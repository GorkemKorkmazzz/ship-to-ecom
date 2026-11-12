import Link from "next/link";
import { db } from "@/lib/db";
import { imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Thumb } from "../../thumb";
import { Flash, PageHeader, StoreBadge } from "../../ui";
import { savePrices } from "../actions";

export default async function Page({ searchParams }: { searchParams: Promise<{ sku?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const sku = sp.sku ?? "";
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const rows = await db.storeVariant.findMany({ where: { matchSku: sku, storeId: { in: stores.map((s) => s.id) } } });
  if (!rows.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">Bu SKU bulunamadı.</p>
        <Link href="/urunler" className="btn mt-4">Ürünlere dön</Link>
      </div>
    );
  }
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
            <p className="text-sm text-gray-500">Değişiklikler doğrudan ikas&apos;a yazılır.</p>
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
      <p className="mt-4 text-xs text-gray-500">
        Ürün adı, açıklama ve görsel değişiklikleri şimdilik ikas panelinden yapılmalı; değişiklik bir sonraki senkronda buraya yansır.
      </p>
    </>
  );
}
