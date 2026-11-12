import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge } from "../../ui";
import { addAlias, removeAlias } from "../actions";

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/[^a-z0-9çğıöşü]+/g, " ").trim();

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (stores.length < 2) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">SKU eşleştirme için iki mağaza bağlı olmalı.</p>
        <Link href="/magazalar" className="btn mt-4">Mağazalar</Link>
      </div>
    );
  }
  const [a, b] = stores;
  const [va, vb, aliases] = await Promise.all([
    db.storeVariant.findMany({ where: { storeId: a.id }, orderBy: { sku: "asc" } }),
    db.storeVariant.findMany({ where: { storeId: b.id }, orderBy: { sku: "asc" } }),
    db.skuAlias.findMany({ where: { storeId: b.id } }),
  ]);
  const keysA = new Set(va.map((v) => v.matchSku));
  const keysB = new Set(vb.map((v) => v.matchSku));
  const freeA = va.filter((v) => !keysB.has(v.matchSku));
  const freeB = vb.filter((v) => !keysA.has(v.matchSku));

  // Öneriler: önce aynı barkod, sonra aynı ürün adı (her iki tarafta da tek aday varsa).
  const suggestions: { a: (typeof va)[number]; b: (typeof vb)[number]; why: string }[] = [];
  const used = new Set<string>();
  for (const x of freeA) {
    const byBarcode = x.barcode ? freeB.filter((y) => y.barcode === x.barcode && !used.has(y.id)) : [];
    let hit = byBarcode.length === 1 ? byBarcode[0] : undefined;
    let why = "Aynı barkod";
    if (!hit) {
      const sameA = freeA.filter((y) => norm(y.productName) === norm(x.productName));
      const sameB = freeB.filter((y) => norm(y.productName) === norm(x.productName) && !used.has(y.id));
      if (sameA.length === 1 && sameB.length === 1) { hit = sameB[0]; why = "Aynı ürün adı"; }
    }
    if (hit) { used.add(hit.id); suggestions.push({ a: x, b: hit, why }); }
  }

  return (
    <>
      <PageHeader title="SKU eşleştir" desc="SKU'su farklı olan aynı ürünleri elle eşleştirin; ikas'taki SKU'lar değişmez.">
        <Link href="/urunler" className="btn-ghost">← Ürünler</Link>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <section className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Öneriler</h2>
            <table className="mt-3 w-full">
              <thead className="border-y border-gray-200 bg-gray-50">
                <tr>
                  <th className="th"><StoreBadge label={a.label} index={0} /></th>
                  <th className="th"><StoreBadge label={b.label} index={1} /></th>
                  <th className="th">Neden</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suggestions.map((s) => (
                  <tr key={s.a.id}>
                    <td className="td"><div className="font-medium">{s.a.productName}</div><div className="font-mono text-xs text-gray-400">{s.a.sku} · stok {s.a.currentStock}</div></td>
                    <td className="td"><div className="font-medium">{s.b.productName}</div><div className="font-mono text-xs text-gray-400">{s.b.sku} · stok {s.b.currentStock}</div></td>
                    <td className="td"><span className="badge bg-sky-100 text-sky-700">{s.why}</span></td>
                    <td className="td text-right">
                      <form action={addAlias}>
                        <input type="hidden" name="skuA" value={s.a.sku} />
                        <input type="hidden" name="skuB" value={s.b.sku} />
                        <button className="btn-ghost">Eşleştir</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!suggestions.length && (
                  <tr><td className="td py-8 text-center text-gray-500" colSpan={4}>Öneri yok. Eşleşmeyen ürünleri sağdaki formdan elle eşleştirebilirsiniz.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card overflow-x-auto p-0">
            <h2 className="px-5 pt-4 font-semibold">Elle yapılan eşleştirmeler</h2>
            <table className="mt-3 w-full">
              <tbody className="divide-y divide-gray-100 border-t border-gray-200">
                {aliases.map((al) => (
                  <tr key={al.id}>
                    <td className="td font-mono text-xs">{a.label}: {al.matchSku}</td>
                    <td className="td font-mono text-xs">{b.label}: {al.sku}</td>
                    <td className="td text-right">
                      <form action={removeAlias}>
                        <input type="hidden" name="id" value={al.id} />
                        <button className="btn-ghost text-red-600">Kaldır</button>
                      </form>
                    </td>
                  </tr>
                ))}
                {!aliases.length && (
                  <tr><td className="td py-6 text-center text-gray-500">Henüz elle eşleştirme yok.</td></tr>
                )}
              </tbody>
            </table>
          </section>
        </div>

        <form action={addAlias} className="card h-fit space-y-3">
          <h2 className="font-semibold">Elle eşleştir</h2>
          <label className="block">
            <span className="label">{a.label} ürünü</span>
            <select className="input" name="skuA" required defaultValue="">
              <option value="" disabled>Seçin ({freeA.length} eşleşmeyen)</option>
              {freeA.map((v) => <option key={v.id} value={v.sku}>{v.sku} — {v.productName}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label">{b.label} ürünü</span>
            <select className="input" name="skuB" required defaultValue="">
              <option value="" disabled>Seçin ({freeB.length} eşleşmeyen)</option>
              {freeB.map((v) => <option key={v.id} value={v.sku}>{v.sku} — {v.productName}</option>)}
            </select>
          </label>
          <button className="btn w-full">Eşleştir</button>
          <p className="text-xs text-gray-500">Eşleşince stoklar farklıysa düşük olan esas alınır ve iki mağazaya yazılır.</p>
        </form>
      </div>
    </>
  );
}
