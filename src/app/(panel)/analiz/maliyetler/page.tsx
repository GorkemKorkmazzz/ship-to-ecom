import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtMoney } from "../../ui";
import { saveCost } from "./actions";

const SRC: Record<string, string> = { IKAS_BUY_PRICE: "ikas alış fiyatı", MANUAL: "Elle", DEMO: "Demo" };
const day = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ sku?: string; q?: string; tamam?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() || null;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true } });
  const storeIds = stores.map((s) => s.id);
  const [variants, open, missingLines] = await Promise.all([
    db.storeVariant.findMany({ where: { storeId: { in: storeIds } }, orderBy: { productName: "asc" }, select: { storeId: true, sku: true, productName: true, buyPrice: true } }),
    db.productCostHistory.findMany({ where: { userId: user.id, validTo: null }, select: { storeId: true, sku: true, unitCost: true, currency: true, source: true, validFrom: true } }),
    db.orderLine.groupBy({ by: ["sku"], where: { unitCost: null, order: { storeId: { in: storeIds }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } } }, _count: { _all: true } }),
  ]);
  const openOf = new Map(open.map((o) => [`${o.storeId}|${o.sku}`, o]));
  const missOf = new Map(missingLines.map((m) => [m.sku, m._count._all]));
  const rows = variants.filter((v) => !q || v.sku.toLowerCase().includes(q) || v.productName.toLowerCase().includes(q));
  const selected = sp.sku ? variants.find((v) => v.sku === sp.sku) ?? null : null;
  const history = selected ? await db.productCostHistory.findMany({ where: { userId: user.id, sku: selected.sku }, orderBy: [{ storeId: "asc" }, { validFrom: "desc" }] }) : [];
  const storeName = new Map(stores.map((s) => [s.id, s.label]));

  return (
    <>
      <PageHeader title="Maliyet geçmişi" desc="Sipariş, verildiği tarihte geçerli maliyetle hesaplanır. ikas alış fiyatı değiştikçe yeni dönem otomatik açılır; geçmiş dönemlerin maliyetini burada elle girebilirsiniz.">
        <Link href="/analiz" className="btn-ghost">← Kârlılık</Link>
      </PageHeader>
      {sp.tamam && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{sp.tamam}</p>}
      {sp.hata && <p className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{sp.hata}</p>}
      <p className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900">
        Güncel alış fiyatı geçmiş siparişlere uygulanmaz. Maliyeti bilinmeyen dönemdeki siparişler kârlılıkta &quot;maliyet eksik&quot; görünür. Elle girdiğiniz kayıt yalnızca maliyeti henüz bilinmeyen kalemlere yansır; daha önce maliyet yazılmış sipariş kalemleri değişmez.
      </p>

      {selected && (
        <section className="card mb-5">
          <h2 className="font-semibold">{selected.productName} <span className="font-mono text-sm font-normal text-gray-500">{selected.sku}</span></h2>
          <form action={saveCost} className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <input type="hidden" name="sku" value={selected.sku} />
            <label className="block"><span className="label">Mağaza</span><select className="input" name="storeId" defaultValue={selected.storeId}>{stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="block"><span className="label">Geçerlilik başlangıcı</span><input className="input" type="date" name="validFrom" required /></label>
            <label className="block"><span className="label">Para birimi</span><input className="input" name="currency" placeholder="TRY" maxLength={3} required /></label>
            <label className="block"><span className="label">Alış maliyeti</span><input className="input" name="purchaseCost" inputMode="decimal" required /></label>
            <label className="block"><span className="label">Üretim</span><input className="input" name="productionCost" inputMode="decimal" /></label>
            <label className="block"><span className="label">Paketleme</span><input className="input" name="packagingCost" inputMode="decimal" /></label>
            <label className="block"><span className="label">Etiket / barkod</span><input className="input" name="labelCost" inputMode="decimal" /></label>
            <label className="block"><span className="label">Diğer</span><input className="input" name="otherCost" inputMode="decimal" /></label>
            <label className="block sm:col-span-2"><span className="label">Not</span><input className="input" name="note" maxLength={200} /></label>
            <div className="flex items-end"><button className="btn">Maliyet ekle</button></div>
          </form>
          <p className="mt-2 text-xs text-gray-500">Birim maliyet = bileşenlerin toplamı. Girilen tarih mevcut bir dönemin içine düşerse o dönem bu tarihte kapanır; kayıtlar silinmez.</p>
          <table className="mt-4 w-full text-sm">
            <thead className="border-y border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Mağaza</th><th className="px-3 py-2">Dönem</th><th className="px-3 py-2 text-right">Birim maliyet</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Not</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-2">{storeName.get(h.storeId)}</td>
                  <td className="px-3 py-2">{day(h.validFrom)} – {h.validTo ? day(h.validTo) : "devam ediyor"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{h.currency ? fmtMoney(h.unitCost, h.currency) : <span title="Para birimi belirlenemedi">{h.unitCost} (para birimi yok)</span>}</td>
                  <td className="px-3 py-2">{SRC[h.source] ?? h.source}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{h.note}</td>
                </tr>
              ))}
              {!history.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Bu ürün için maliyet kaydı yok.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto p-0">
        <form className="flex flex-wrap items-end gap-2 px-5 pt-4">
          <label className="block"><span className="label">Ürün adı / SKU</span><input className="input" name="q" defaultValue={sp.q ?? ""} /></label>
          <button className="btn-ghost">Ara</button>
        </form>
        <table className="mt-3 w-full min-w-[720px] text-sm">
          <thead className="border-y border-gray-200 bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-3 py-2">Ürün</th><th className="px-3 py-2">Mağaza</th><th className="px-3 py-2 text-right">ikas alış fiyatı</th><th className="px-3 py-2 text-right">Geçerli maliyet</th><th className="px-3 py-2">Kaynak / başlangıç</th><th className="px-3 py-2 text-right">Maliyetsiz kalem</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((v) => {
              const o = openOf.get(`${v.storeId}|${v.sku}`);
              return (
                <tr key={`${v.storeId}|${v.sku}`} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><Link href={`/analiz/maliyetler?sku=${encodeURIComponent(v.sku)}`} className="font-medium hover:text-indigo-700">{v.productName}</Link><div className="font-mono text-xs text-gray-500">{v.sku}</div></td>
                  <td className="px-3 py-2">{storeName.get(v.storeId)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{v.buyPrice ?? <span className="text-gray-400">yok</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{o ? (o.currency ? fmtMoney(o.unitCost, o.currency) : `${o.unitCost} (para birimi yok)`) : <span className="text-gray-400">kayıt yok</span>}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{o ? `${SRC[o.source] ?? o.source} · ${day(o.validFrom)}` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{missOf.get(v.sku) ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-5 py-3 text-xs text-gray-500">&quot;Maliyetsiz kalem&quot;: iptal edilmemiş siparişlerde sipariş anındaki maliyeti kaydedilmemiş kalem sayısı (SKU bazında, tüm mağazalar).</p>
      </section>
    </>
  );
}
