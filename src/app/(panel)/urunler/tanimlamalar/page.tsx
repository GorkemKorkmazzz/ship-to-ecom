import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { ROUND_OPTIONS } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader } from "../../ui";
import { addDefinition, changePricesByDefinition, removeDefinition } from "./actions";

const KINDS = [
  { kind: "category", title: "Kategoriler", hint: "Ürünleri gruplamak ve kategoriye göre toplu fiyat değiştirmek için.", placeholder: "Örn. Tişört" },
  { kind: "brand", title: "Markalar", hint: "Ürün eklerken öneri olarak çıkar; markaya göre toplu fiyat değiştirilebilir.", placeholder: "Örn. Atölye" },
  { kind: "field", title: "Özel alanlar", hint: "Ürünlere kendi bilgilerinizi ekleyin (ör. raf kodu, tedarikçi, sezon).", placeholder: "Örn. Raf kodu" },
] as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "fiyat")) return <Locked moduleId="fiyat" />;
  const sp = await searchParams;
  const [stores, defs, settings] = await Promise.all([
    getStores(user.id),
    db.definition.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    db.skuSetting.findMany({ where: { userId: user.id }, select: { category: true, brand: true, fields: true } }),
  ]);
  const count = (kind: string, name: string) =>
    kind === "category" ? settings.filter((s) => s.category === name).length
    : kind === "brand" ? settings.filter((s) => s.brand === name).length
    : settings.filter((s) => s.fields.includes(JSON.stringify(name))).length;
  const groups = defs.filter((d) => d.kind === "category" || d.kind === "brand");

  return (
    <>
      <PageHeader title="Tanımlamalar" desc="Kategori, marka ve özel alanlarınız. Yalnızca bu panelde saklanır; mağazalarınızdaki kategorileri değiştirmez.">
        <div className="flex gap-2">
          <Link href="/urunler/yeni" className="btn-ghost">+ Ürün ekle</Link>
          <Link href="/urunler" className="btn-ghost">← Ürünler</Link>
        </div>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <div className="grid gap-5 lg:grid-cols-3">
        {KINDS.map((k) => {
          const list = defs.filter((d) => d.kind === k.kind);
          return (
            <section key={k.kind} className="card flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{k.title}</h2>
                <span className="badge bg-gray-100 text-gray-600">{list.length}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-500">{k.hint}</p>
              <ul className="mt-4 flex-1 divide-y divide-gray-100 border-y border-gray-100">
                {list.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{d.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-gray-500">{count(d.kind, d.name)} ürün</span>
                      <form action={removeDefinition}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-xs font-medium text-red-600 hover:underline" aria-label={`${d.name} tanımını sil`}>Sil</button>
                      </form>
                    </span>
                  </li>
                ))}
                {!list.length && <li className="py-6 text-center text-sm text-gray-500">Henüz tanım yok.</li>}
              </ul>
              <form action={addDefinition} className="mt-4 flex gap-2">
                <input type="hidden" name="kind" value={k.kind} />
                <input className="input" name="name" placeholder={k.placeholder} maxLength={80} required aria-label={`${k.title}: yeni ad`} />
                <button className="btn shrink-0">Ekle</button>
              </form>
            </section>
          );
        })}
      </div>

      <form action={changePricesByDefinition} className="card mt-5">
        <h2 className="font-semibold">Kategoriye ya da markaya göre fiyat değiştir</h2>
        <p className="mt-0.5 text-sm text-gray-500">Seçtiğiniz gruptaki tüm ürünlerin satış ve indirimli fiyatı yüzdeyle değişir ve mağazalara yazılır. Alış fiyatı değişmez.</p>
        {!groups.length ? (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">Önce bir kategori ya da marka tanımlayın, sonra ürün düzenleme sayfasından ürünlere atayın.</p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block lg:col-span-2">
                <span className="label">Kategori / marka</span>
                <GroupSelect groups={groups.map((g) => ({ kind: g.kind, name: g.name, count: count(g.kind, g.name) }))} />
              </label>
              <label className="block">
                <span className="label">Yüzde (%)</span>
                <input className="input" name="percent" inputMode="decimal" placeholder="Örn. 10 ya da -5" required />
              </label>
              <label className="block">
                <span className="label">Yuvarlama</span>
                <select className="input" name="round" defaultValue="none">
                  {ROUND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="label mb-0">Mağazalar:</span>
              {stores.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input type="checkbox" name="storeIds" value={s.id} defaultChecked={!s.priceRuleActive} disabled={s.priceRuleActive} /> {s.label}
                  {s.priceRuleActive && <span className="text-xs text-gray-500">(otomatik fiyat kuralı)</span>}
                </label>
              ))}
            </div>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" className="mt-0.5" required />
              <span>Fiyatların seçili mağazalara <b>hemen yazılacağını</b> ve bu işlemin otomatik geri alınamayacağını anladım.</span>
            </label>
            <button className="btn mt-4">Fiyatları değiştir</button>
          </>
        )}
      </form>
    </>
  );
}

/** Tür ve ad tek seçimde alınır ("tür|ad"); böylece kategori seçip marka adı göndermek mümkün olmaz. */
function GroupSelect({ groups }: { groups: { kind: string; name: string; count: number }[] }) {
  const of = (kind: string) => groups.filter((g) => g.kind === kind);
  const options = (kind: string) => of(kind).map((g) => <option key={`${kind}-${g.name}`} value={`${kind}|${g.name}`}>{g.name} ({g.count} ürün)</option>);
  return (
    <select className="input" name="group" required defaultValue="">
      <option value="" disabled>Seçin…</option>
      {of("category").length > 0 && <optgroup label="Kategoriler">{options("category")}</optgroup>}
      {of("brand").length > 0 && <optgroup label="Markalar">{options("brand")}</optgroup>}
    </select>
  );
}
