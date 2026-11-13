import Link from "next/link";
import { savePriceRule } from "@/app/actions";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { ROUND_OPTIONS, applyRule, imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Thumb } from "../thumb";
import { Flash, PageHeader, StoreBadge, SyncButton } from "../ui";
import { copyToStore } from "./actions";

const price = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLocaleLowerCase("tr");
  const stores = await getStores(user.id);
  const variants = await db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  const shared = new Map((await db.sharedItem.findMany({ where: { userId: user.id } })).map((s) => [s.sku, s.sharedStock]));

  const target = stores.find((s) => s.priceRuleActive);
  const source = target ? stores.find((s) => s.id !== target.id) : undefined;
  const rule = target ? { percent: target.pricePercent, fixed: target.priceFixed, round: target.priceRound } : null;

  type Row = { sku: string; name: string; image: string | null; per: ((typeof variants)[number] | null)[] };
  const rows = new Map<string, Row>();
  for (const v of variants) {
    const i = stores.findIndex((s) => s.id === v.storeId);
    const r = rows.get(v.matchSku) ?? { sku: v.matchSku, name: v.productName, image: null, per: stores.map(() => null) };
    r.per[i] = v;
    r.image ??= imageUrl(stores[i].merchantId, v.imageId);
    rows.set(v.matchSku, r);
  }
  let list = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "tr") || a.sku.localeCompare(b.sku, "tr"));
  if (q) list = list.filter((r) => r.sku.toLocaleLowerCase("tr").includes(q) || r.name.toLocaleLowerCase("tr").includes(q));
  const total = list.length;
  list = list.slice(0, 300);

  const editing = target ?? stores[1] ?? stores[0];

  return (
    <>
      <PageHeader title="Ürünler" desc={`${rows.size} SKU · fiyatlar mağazaların varsayılan fiyatlarıdır`}>
        <div className="flex flex-wrap gap-2">
          <Link href="/urunler/eslestir" className="btn-ghost">SKU eşleştir</Link>
          <Link href="/urunler/toplu" className="btn-ghost">Toplu işlemler</Link>
          <Link href="/urunler/yeni" className="btn-ghost">+ Ürün ekle</Link>
          <SyncButton path="/urunler" />
        </div>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      {stores.length >= 2 && (
        <form action={savePriceRule} className="card mb-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Otomatik fiyat kuralı</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Seçtiğiniz mağazanın fiyatları, diğer mağazanın fiyatlarından otomatik hesaplanır ve her senkronda güncellenir.
              </p>
            </div>
            <span className={`badge ${target ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
              {target ? `Açık · ${target.label} ← ${source?.label}` : "Kapalı"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Fiyatı ayarlanacak mağaza</span>
              <select className="input" name="storeId" defaultValue={target?.id ?? ""}>
                <option value="">Kapalı (fiyatlara dokunma)</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Yüzde farkı (%)</span>
              <input className="input" name="percent" inputMode="decimal" defaultValue={editing.pricePercent} placeholder="Örn. 10 veya -5" />
            </label>
            <label className="block">
              <span className="label">Sabit fark (tutar)</span>
              <input className="input" name="fixed" inputMode="decimal" defaultValue={editing.priceFixed} placeholder="Örn. 20" />
            </label>
            <label className="block">
              <span className="label">Yuvarlama</span>
              <select className="input" name="round" defaultValue={editing.priceRound}>
                {ROUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn">Kaydet ve uygula</button>
            <p className="text-xs text-gray-500">
              Örnek: 100,00 → {price(applyRule(100, rule ?? { percent: editing.pricePercent, fixed: editing.priceFixed, round: editing.priceRound }))}.
              Satış ve indirimli fiyat birlikte hesaplanır; alış fiyatı ve kaynak mağaza değişmez.
            </p>
          </div>
        </form>
      )}

      <form className="mb-4 flex gap-2">
        <input className="input max-w-xs" name="q" defaultValue={sp.q ?? ""} placeholder="SKU veya ürün adı ara" />
        <button className="btn-ghost">Ara</button>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="th">Ürün</th>
              <th className="th text-right">Ortak stok</th>
              {stores.map((s, i) => (
                <th key={s.id} className="th text-right">
                  <StoreBadge label={s.label} index={i} />
                  {target?.id === s.id && <span className="ml-1 normal-case text-emerald-700">otomatik</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {list.map((r) => (
              <tr key={r.sku}>
                <td className="td">
                  <div className="flex items-center gap-3">
                    <Thumb src={r.image} alt={r.name} />
                    <div className="min-w-0">
                      <Link href={`/urunler/duzenle?sku=${encodeURIComponent(r.sku)}`} className="block truncate font-medium hover:text-indigo-700 hover:underline">{r.name}</Link>
                      <div className="font-mono text-xs text-gray-400">{r.sku}</div>
                    </div>
                  </div>
                </td>
                <td className="td text-right font-semibold tabular-nums">{shared.get(r.sku) ?? "—"}</td>
                {r.per.map((v, i) => (
                  <td key={i} className="td whitespace-nowrap text-right tabular-nums">
                    {!v ? (
                      (() => {
                        const from = r.per.findIndex((x) => x);
                        return stores.length > 1 && from >= 0 ? (
                          <form action={copyToStore} className="inline">
                            <input type="hidden" name="sku" value={r.sku} />
                            <input type="hidden" name="from" value={stores[from].id} />
                            <input type="hidden" name="to" value={stores[i].id} />
                            <button className="btn-ghost px-2 py-1 text-xs" title="Ürünü tüm varyantlarıyla bu mağazada oluşturur">Buraya kopyala</button>
                          </form>
                        ) : (
                          <span className="text-gray-400">yok</span>
                        );
                      })()
                    ) : v.discountPrice !== null ? (
                      <>
                        <span className="font-medium">{price(v.discountPrice)}</span>
                        <span className="ml-2 text-xs text-gray-400 line-through">{price(v.sellPrice)}</span>
                      </>
                    ) : (
                      <span className="font-medium">{price(v.sellPrice)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!list.length && (
              <tr><td className="td py-8 text-center text-gray-500" colSpan={2 + stores.length}>Ürün yok. Mağazaları bağlayıp senkronize edin.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > list.length && <p className="mt-2 text-xs text-gray-500">İlk {list.length} / {total} kayıt gösteriliyor; aramayı daraltın.</p>}
    </>
  );
}
