"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createProduct, type CreateState } from "./actions";

type VType = { name: string; values: string[] };
type Override = { sku?: string; barcode?: string; sellPrice?: string; discountPrice?: string; buyPrice?: string; stock?: string; isActive?: boolean };

const toNum = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};
const TR: Record<string, string> = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U" };
const skuPart = (s: string) =>
  s.toLocaleUpperCase("tr").replace(/[ÇĞİÖŞÜ]/g, (c) => TR[c]).replace(/[^A-Z0-9]+/g, "").slice(0, 12);

function combos(types: VType[]): string[][] {
  const active = types.filter((t) => t.name.trim() && t.values.length);
  if (!active.length) return [[]];
  return active.reduce<string[][]>((acc, t) => acc.flatMap((a) => t.values.map((v) => [...a, v])), [[]]);
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

/** Virgül/Enter ile eklenen çoklu değer girişi (kategori, etiket, varyant değeri). */
function Chips({ values, onChange, placeholder, list }: { values: string[]; onChange: (v: string[]) => void; placeholder: string; list?: string }) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
      {values.map((v) => (
        <span key={v} className="badge bg-gray-100 text-gray-700">
          {v}
          <button type="button" aria-label={`${v} kaldır`} className="ml-1 cursor-pointer text-gray-400 hover:text-gray-700" onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
        </span>
      ))}
      <input
        className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        value={text}
        list={list}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={() => text.trim() && add(text)}
      />
    </div>
  );
}

export function ProductForm({ stores, brands, categories, tags }: {
  stores: { id: string; label: string }[];
  brands: string[];
  categories: string[];
  tags: string[];
}) {
  const [state, action, pending] = useActionState<CreateState, FormData>(createProduct, {});
  const top = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [type, setType] = useState<"PHYSICAL" | "DIGITAL">("PHYSICAL");
  const [active, setActive] = useState(true);
  const [sellPrice, setSellPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [stock, setStock] = useState("");
  const [sellIfOutOfStock, setSellIfOutOfStock] = useState(false);
  const [weight, setWeight] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [brand, setBrand] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [tagList, setTagList] = useState<string[]>([]);
  const [publishAll, setPublishAll] = useState(true);
  const [storeIds, setStoreIds] = useState(stores.map((s) => s.id));
  const [slug, setSlug] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [imageUrls, setImageUrls] = useState("");
  const [types, setTypes] = useState<VType[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  useEffect(() => {
    if (state.error || state.results) top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [state]);

  const activeTypes = types.filter((t) => t.name.trim() && t.values.length);
  const hasVariants = activeTypes.length > 0;
  const rows = useMemo(() => combos(types), [types]);

  const variants = rows.map((values) => {
    const key = values.join("\u0001");
    const o = hasVariants ? overrides[key] ?? {} : {};
    const autoSku = hasVariants && sku.trim() ? [sku.trim(), ...values.map(skuPart)].join("-") : sku.trim();
    return {
      key,
      values,
      sku: o.sku ?? autoSku,
      barcode: o.barcode ?? (hasVariants ? "" : barcode),
      sellPrice: o.sellPrice ?? sellPrice,
      discountPrice: o.discountPrice ?? discountPrice,
      buyPrice: o.buyPrice ?? buyPrice,
      stock: o.stock ?? stock,
      isActive: (o.isActive ?? true) && active,
      rowActive: o.isActive ?? true,
    };
  });
  const setO = (key: string, patch: Override) => setOverrides((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  const payload = JSON.stringify({
    name, description, shortDescription, type, brand,
    categories: cats, tags: tagList,
    weight: toNum(weight), maxQuantityPerCart: toNum(maxQty),
    sellIfOutOfStock, publishAllChannels: publishAll,
    seo: { slug, pageTitle, description: metaDesc },
    variantTypes: activeTypes.map((t) => ({ name: t.name.trim(), values: t.values })),
    variants: variants.map((v) => ({
      values: v.values, sku: v.sku, barcode: v.barcode,
      sellPrice: toNum(v.sellPrice), discountPrice: toNum(v.discountPrice), buyPrice: toNum(v.buyPrice),
      stock: toNum(v.stock) ?? 0, isActive: v.isActive,
    })),
    imageUrls: imageUrls.split(/\s+/).filter(Boolean),
    storeIds,
  });

  const setType_ = (i: number, patch: Partial<VType>) => setTypes((p) => p.map((t, k) => (k === i ? { ...t, ...patch } : t)));
  const cell = "w-full min-w-[5.5rem] rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-500";

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={payload} />
      <div ref={top} className="scroll-mt-4">
        {state.error && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{state.error}</p>}
        {state.results && (
          <div className="mb-4 space-y-2">
            {state.results.map((r) => (
              <p key={r.store} className={`rounded-lg px-4 py-2.5 text-sm ${r.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                <b>{r.store}:</b> {r.message}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Temel bilgiler">
            <Field label="Ürün adı *">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Açıklama" hint="HTML kullanılabilir.">
              <textarea className="input min-h-32" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field label="Kısa açıklama">
              <textarea className="input" rows={2} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
            </Field>
          </Section>

          <Section title="Görseller" hint="En fazla 10 görsel, her biri en çok 5 MB. İlk görsel ana görsel olur.">
            <Field label="Dosyadan yükle">
              <input className="block w-full text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" type="file" name="images" accept="image/*" multiple />
            </Field>
            <Field label="veya görsel adresleri" hint="Her satıra bir adres.">
              <textarea className="input font-mono text-xs" rows={2} value={imageUrls} onChange={(e) => setImageUrls(e.target.value)} placeholder="https://..." />
            </Field>
          </Section>

          <Section title="Fiyat" hint={hasVariants ? "Tüm varyantlar için varsayılan; aşağıdaki tabloda varyant bazında değiştirilebilir." : undefined}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Satış fiyatı *">
                <input className="input" inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="İndirimli fiyat">
                <input className="input" inputMode="decimal" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Alış fiyatı">
                <input className="input" inputMode="decimal" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder="0,00" />
              </Field>
            </div>
          </Section>

          <Section title="Envanter" hint="Stok, iki mağazanın ortak stoğudur.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={hasVariants ? "SKU öneki *" : "SKU *"} hint={hasVariants ? "Varyant SKU'ları bundan türetilir." : "Mağazalar arası eşleşme bununla yapılır."}>
                <input className="input font-mono" value={sku} onChange={(e) => setSku(e.target.value)} />
              </Field>
              {!hasVariants && (
                <Field label="Barkod">
                  <input className="input font-mono" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
                </Field>
              )}
              <Field label={hasVariants ? "Varsayılan stok" : "Stok adedi"}>
                <input className="input" inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sellIfOutOfStock} onChange={(e) => setSellIfOutOfStock(e.target.checked)} />
              Stok tükendiğinde satmaya devam et
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Ağırlık (kg)">
                <input className="input" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </Field>
              <Field label="Sepet başına en fazla adet">
                <input className="input" inputMode="numeric" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
              </Field>
            </div>
          </Section>

          <Section title="Varyantlar" hint="Beden, renk gibi seçenekler ekleyin; kombinasyonlar otomatik oluşur. En fazla 3 varyant tipi.">
            {types.map((t, i) => (
              <div key={i} className="grid gap-3 rounded-lg border border-gray-200 p-3 sm:grid-cols-[10rem_1fr_auto]">
                <input className="input" aria-label="Varyant tipi adı" placeholder="Örn. Beden" value={t.name} onChange={(e) => setType_(i, { name: e.target.value })} />
                <Chips values={t.values} onChange={(values) => setType_(i, { values })} placeholder="Değer yazıp Enter'a basın (S, M, L)" />
                <button type="button" className="btn-ghost text-red-600" onClick={() => setTypes((p) => p.filter((_, k) => k !== i))}>Sil</button>
              </div>
            ))}
            {types.length < 3 && (
              <button type="button" className="btn-ghost" onClick={() => setTypes((p) => [...p, { name: "", values: [] }])}>
                + Varyant tipi ekle
              </button>
            )}
            {hasVariants && (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="th">Varyant</th>
                      <th className="th">SKU</th>
                      <th className="th">Barkod</th>
                      <th className="th">Satış</th>
                      <th className="th">İndirimli</th>
                      <th className="th">Alış</th>
                      <th className="th">Stok</th>
                      <th className="th">Aktif</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {variants.map((v) => (
                      <tr key={v.key}>
                        <td className="td whitespace-nowrap font-medium">{v.values.join(" / ")}</td>
                        <td className="td"><input className={`${cell} min-w-[9rem] font-mono`} aria-label="SKU" value={v.sku} onChange={(e) => setO(v.key, { sku: e.target.value })} /></td>
                        <td className="td"><input className={`${cell} font-mono`} aria-label="Barkod" value={v.barcode} onChange={(e) => setO(v.key, { barcode: e.target.value })} /></td>
                        <td className="td"><input className={cell} aria-label="Satış fiyatı" inputMode="decimal" value={v.sellPrice} onChange={(e) => setO(v.key, { sellPrice: e.target.value })} /></td>
                        <td className="td"><input className={cell} aria-label="İndirimli fiyat" inputMode="decimal" value={v.discountPrice} onChange={(e) => setO(v.key, { discountPrice: e.target.value })} /></td>
                        <td className="td"><input className={cell} aria-label="Alış fiyatı" inputMode="decimal" value={v.buyPrice} onChange={(e) => setO(v.key, { buyPrice: e.target.value })} /></td>
                        <td className="td"><input className={cell} aria-label="Stok" inputMode="numeric" value={v.stock} onChange={(e) => setO(v.key, { stock: e.target.value })} /></td>
                        <td className="td"><input type="checkbox" aria-label="Aktif" checked={v.rowActive} onChange={(e) => setO(v.key, { isActive: e.target.checked })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title="Arama motoru (SEO)" hint="Boş bırakılırsa ikas varsayılanları kullanılır.">
            <Field label="Sayfa başlığı">
              <input className="input" value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
            </Field>
            <Field label="Meta açıklama">
              <textarea className="input" rows={2} value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} />
            </Field>
            <Field label="Bağlantı (slug)">
              <input className="input font-mono" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="urun-adi" />
            </Field>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Durum">
            <select className="input" value={active ? "1" : "0"} onChange={(e) => setActive(e.target.value === "1")}>
              <option value="1">Aktif</option>
              <option value="0">Pasif</option>
            </select>
          </Section>

          <Section title="Mağazalar" hint="Ürün seçili mağazalarda oluşturulur.">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={storeIds.includes(s.id)}
                  onChange={(e) => setStoreIds((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
                />
                {s.label}
              </label>
            ))}
            <label className="flex items-center gap-2 border-t border-gray-100 pt-3 text-sm">
              <input type="checkbox" checked={publishAll} onChange={(e) => setPublishAll(e.target.checked)} />
              Tüm satış kanallarında yayınla
            </label>
          </Section>

          <Section title="Ürün tipi">
            <select className="input" value={type} onChange={(e) => setType(e.target.value as "PHYSICAL" | "DIGITAL")}>
              <option value="PHYSICAL">Fiziksel ürün</option>
              <option value="DIGITAL">Dijital ürün</option>
            </select>
          </Section>

          <Section title="Organizasyon" hint="Mağazada yoksa otomatik oluşturulur.">
            <Field label="Marka">
              <input className="input" list="dl-brands" value={brand} onChange={(e) => setBrand(e.target.value)} />
            </Field>
            <div>
              <span className="label">Kategoriler</span>
              <Chips values={cats} onChange={setCats} placeholder="Kategori yazıp Enter'a basın" list="dl-categories" />
            </div>
            <div>
              <span className="label">Etiketler</span>
              <Chips values={tagList} onChange={setTagList} placeholder="Etiket yazıp Enter'a basın" list="dl-tags" />
            </div>
            <datalist id="dl-brands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
            <datalist id="dl-categories">{categories.map((b) => <option key={b} value={b} />)}</datalist>
            <datalist id="dl-tags">{tags.map((b) => <option key={b} value={b} />)}</datalist>
          </Section>

          <button className="btn w-full" disabled={pending}>
            {pending ? "Mağazalara gönderiliyor…" : "Ürünü kaydet"}
          </button>
        </div>
      </div>
    </form>
  );
}
