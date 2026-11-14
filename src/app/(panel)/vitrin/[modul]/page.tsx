import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { storeHost } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { PREVIEW_PARAM, moduleTotals, previewToken } from "@/lib/storefront";
import { eventsOf, inSchedule, parseSettings, sfModule } from "@/lib/storefront/modules";
import { Flash, PageHeader } from "../../ui";
import { toggleModule } from "../actions";
import { listNamed } from "@/lib/ikas";
import { TIER_MODULE, tierOrderStats, tiersOf } from "@/lib/storefront/tiers";
import { LOW_STOCK_MODULE, lowStockStats } from "@/lib/storefront/stock";
import { WHEEL_MODULE, wheelStats } from "@/lib/storefront/wheel";
import { FLASH_MODULE, flashFeed } from "@/lib/storefront/flash";
import { LABEL_MODULE, labelStats } from "@/lib/storefront/labels";
import { type Scalar, trTime } from "@/lib/storefront/modules";
import { fmtMoney } from "../../ui";
import { Editor, type Sources } from "./editor";

/** Ürün/kategori seçicileri için gerçek mağaza verisi: ürünler son senkrondan, kategoriler ikas Admin API'sinden. */
async function sourcesFor(store: Parameters<typeof listNamed>[0], need: Set<string>): Promise<Sources & { error?: string }> {
  const out: Sources & { error?: string } = { products: [], categories: [], variants: [] };
  if (need.has("products")) {
    const rows = await db.storeVariant.findMany({ where: { storeId: store.id }, select: { productId: true, productName: true }, distinct: ["productId"], orderBy: { productName: "asc" } });
    out.products = rows.map((r) => ({ id: r.productId, name: r.productName }));
  }
  if (need.has("variants")) {
    const rows = await db.storeVariant.findMany({ where: { storeId: store.id }, select: { variantId: true, productName: true, sku: true }, orderBy: [{ productName: "asc" }, { sku: "asc" }] });
    out.variants = rows.map((r) => ({ id: r.variantId, name: `${r.productName} · ${r.sku}` }));
  }
  if (need.has("categories")) {
    try {
      out.categories = (await listNamed(store, "category")).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    } catch (e) {
      out.error = `Kategoriler ikas'tan alınamadı: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return out;
}

export default async function Page({ params, searchParams }: { params: Promise<{ modul: string }>; searchParams: Promise<{ magaza?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "vitrin")) return <Locked moduleId="vitrin" />;
  const [{ modul }, sp] = await Promise.all([params, searchParams]);
  const mod = sfModule(modul);
  if (!mod) notFound();
  const stores = await getStores(user.id);
  const store = stores.find((s) => s.id === sp.magaza);
  if (!store) notFound();
  const [row, totals, loader] = await Promise.all([
    db.storeModule.findUnique({ where: { storeId_moduleKey: { storeId: store.id, moduleKey: mod.key } } }),
    moduleTotals(store.id),
    readFile(path.join(process.cwd(), "public/sf/loader.js"), "utf8"),
  ]);
  const need = new Set(mod.fields.flatMap((f) => [f, ...(f.of ?? [])]).flatMap((f) => (f.source ? [f.source] : [])));
  const sources = await sourcesFor(store, need);
  const live = parseSettings(mod, row?.settings);
  const shown = row?.draft != null ? parseSettings(mod, row.draft) : live;
  const t = totals[mod.key];
  // Çok Al Az Öde: gerçek siparişlerden sonuç ve kampanya durumu.
  const camps = mod.key === TIER_MODULE ? ((live.campaigns as Record<string, Scalar>[]) ?? []) : [];
  const orders = mod.key === TIER_MODULE ? await tierOrderStats(store.id, camps.map((c) => String(c.name))) : null;
  const nowMs = new Date().getTime();
  const lowStock = mod.key === LOW_STOCK_MODULE ? await lowStockStats(store.id, live) : null;
  const wheel = mod.key === WHEEL_MODULE ? await wheelStats(store, live) : null;
  // Önizleme verisi: kaydedilen kampanyaların gerçek ürünleri (tasarım değişiklikleri anlık, ürün seçimi kayıttan sonra).
  const previewData = mod.key === FLASH_MODULE ? { campaigns: await flashFeed(store, shown, false) } : undefined;
  const labelInfo = mod.key === LABEL_MODULE ? await labelStats(store, live) : null;
  // ikas kampanyası tutan modüllerde siparişlerden kampanya sonucu (indirim satırındaki kampanya adı).
  const campSales = mod.key === FLASH_MODULE || mod.key === "fiyat-alti-indirim" ? await tierOrderStats(store.id, ((live.campaigns as Record<string, Scalar>[]) ?? []).map((c) => String(c.name))) : null;
  const campStatus = (c: Record<string, Scalar>) =>
    c.active === false ? "Pasif" : !row?.enabled ? "Modül pasif · ikas'ta yok" : !c.ikasId ? "ikas'ta yok" : trTime(c.startAt) > nowMs ? "Başlamadı" : trTime(c.endAt) <= nowMs ? "Süresi doldu" : "Yayında · ikas'ta aktif";
  const storeUrl = store.sfKey ? `https://${storeHost(store)}/?${PREVIEW_PARAM}=${await previewToken(store.id)}` : null;
  const status = !row?.enabled ? "Pasif" : !row.publishedAt ? "Aktif · yayınlanmış ayar yok" : inSchedule(live) ? "Aktif · mağazada görünüyor" : "Aktif · tarih aralığı dışında";

  return (
    <>
      <PageHeader title={mod.name} desc={mod.description}>
        <Link className="btn-ghost" href={`/vitrin?magaza=${store.id}`}>Modüllere dön</Link>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata ?? sources.error} />
      {mod.help && <p className="mb-4 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">{mod.help}</p>}

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="label !mb-0">Mağaza</span>
            {stores.map((s) => (
              <Link key={s.id} href={`/vitrin/${mod.key}?magaza=${s.id}`} className={s.id === store.id ? "btn" : "btn-ghost"}>{s.label}</Link>
            ))}
          </div>
          <p className="text-sm text-gray-600">{storeHost(store)} · {row?.publishedAt ? `sürüm ${row.version}` : "henüz yayınlanmadı"}</p>
          <form action={toggleModule} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="moduleKey" value={mod.key} />
            <input type="hidden" name="back" value="modul" />
            <input type="hidden" name="enabled" value={row?.enabled ? "0" : "1"} />
            <span className={`rounded-full px-2.5 py-0.5 text-xs ${row?.enabled ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{status}</span>
            <button className="btn-ghost">{row?.enabled ? "Pasif yap" : "Aktif yap"}</button>
          </form>
          {!store.sfKey && <p className="text-xs text-amber-700">Bu mağazada vitrin betiği kurulu değil: <Link className="underline" href={`/vitrin?magaza=${store.id}`}>kurulum satırını alın</Link>.</p>}
          {storeUrl && <a className="btn-ghost inline-block" href={storeUrl} target="_blank" rel="noopener noreferrer">Taslağı mağazada önizle (30 dk geçerli)</a>}
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">İstatistikler <span className="text-sm font-normal text-gray-500">· son 30 gün, bu mağaza</span></h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {eventsOf(mod).map(([k, label]) => (
              <div key={k} className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">{label}</dt><dd className="text-lg font-semibold tabular-nums">{t?.[k] ?? 0}</dd></div>
            ))}
            {eventsOf(mod).some(([k]) => k === "click") && (<div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Tıklanma oranı</dt><dd className="text-lg font-semibold tabular-nums">{t?.view ? `%${((t.click / t.view) * 100).toFixed(1)}` : "-"}</dd></div>)}
            {orders && (
              <>
                <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Yararlanan sipariş</dt><dd className="text-lg font-semibold tabular-nums">{orders.count}</dd></div>
                <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Dönüşüm oranı</dt><dd className="text-lg font-semibold tabular-nums">{t?.view ? `%${((orders.count / t.view) * 100).toFixed(1)}` : "-"}</dd></div>
                <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Kampanyalı satış</dt><dd className="text-lg font-semibold tabular-nums">{fmtMoney(orders.revenue, orders.currency)}</dd></div>
                <div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Verilen indirim</dt><dd className="text-lg font-semibold tabular-nums">{fmtMoney(orders.discount, orders.currency)}</dd></div>
              </>
            )}
          </dl>
          {camps.length > 0 && (
            <ul className="mt-3 divide-y text-sm">
              {camps.map((c, i) => (
                <li key={i} className="flex justify-between gap-2 py-1.5"><span>{String(c.name)} <span className="text-xs text-gray-500">· {tiersOf(c).map((x) => `${x.qty}+ → ${c.discountType === "RATIO" ? `%${x.amount}` : `${x.amount} TL`}`).join(", ")}</span></span><span className="shrink-0 text-xs text-gray-600">{campStatus(c)}</span></li>
              ))}
            </ul>
          )}
          {labelInfo && (
            <div className="mt-3 space-y-1 text-sm">
              <p>Şu an etiketli ürün: <b>{labelInfo.products}</b> · bu ürünlerin son 30 gün satışı: <b>{labelInfo.qty}</b> adet · <b>{fmtMoney(labelInfo.revenue, "TRY")}</b></p>
              {((live.labels as Record<string, Scalar>[]) ?? []).map((l, i) => (
                <p key={i} className="text-xs text-gray-600">{String(l.text)}: <b>{labelInfo.perLabel[i] ?? 0}</b> ürün{l.active === false ? " (pasif)" : ""}</p>
              ))}
              <p className="text-xs text-gray-500">Satış, şu an etiketli ürünlerin toplam satışıdır; etiketin etkisini ayrı ölçmez. Ürün bilgisi yayında ve en geç 6 saatte bir ikas&apos;tan yenilenir.</p>
            </div>
          )}
          {campSales && (
            <p className="mt-3 text-sm">Kampanya kaynaklı satış (son 30 gün): <b>{campSales.count}</b> sipariş · <b>{fmtMoney(campSales.revenue, campSales.currency)}</b> · verilen indirim <b>{fmtMoney(campSales.discount, campSales.currency)}</b></p>
          )}
          {wheel && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Çevirme</div><div className="text-lg font-semibold tabular-nums">{wheel.spins}</div></div>
                <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Kazanılan ödül</div><div className="text-lg font-semibold tabular-nums">{wheel.wins}</div></div>
                <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Katılım dönüşümü</div><div className="text-lg font-semibold tabular-nums">{t?.view ? `%${((wheel.spins / t.view) * 100).toFixed(1)}` : "-"}</div></div>
                <div className="rounded-lg bg-gray-50 p-3"><div className="text-xs text-gray-500">Kullanılan kupon</div><div className="text-lg font-semibold tabular-nums">{wheel.used ?? "-"}</div></div>
              </div>
              {wheel.usedError && <p className="text-xs text-amber-700">Kupon kullanımı ikas&apos;tan okunamadı: {wheel.usedError}</p>}
              {wheel.byPrize.length > 0 && (
                <ul className="divide-y">{wheel.byPrize.map((p) => <li key={p.label + p.type} className="flex justify-between py-1"><span>{p.label}</span><b className="tabular-nums">{p.count}</b></li>)}</ul>
              )}
              <p className="text-xs text-gray-500">Katılım dönüşümü = çevirme / görüntülenme (oturum). Kullanılan kupon: çarktan verilen ve ikas&apos;ta en az bir kez kullanılmış kupon sayısı (tüm zamanlar).</p>
            </div>
          )}
          {lowStock && (
            <div className="mt-3 space-y-2 text-sm">
              {lowStock.sales ? (
                <p>Hedeflenen ürünlerin son 30 gün satışı: <b>{lowStock.sales.qty}</b> adet · <b>{fmtMoney(lowStock.sales.revenue, lowStock.sales.currency)}</b>. Şu an eşikte olan varyantlardan: <b>{lowStock.sales.lowNow.qty}</b> adet · <b>{fmtMoney(lowStock.sales.lowNow.revenue, lowStock.sales.currency)}</b>.</p>
              ) : (
                <p className="text-xs text-gray-500">Kategori hedeflemesinde ürün bazlı satış ve eşikteki varyant listesi hesaplanamıyor: ürün-kategori ilişkisi panelde tutulmuyor.</p>
              )}
              {lowStock.low && (
                <div>
                  <p className="text-xs text-gray-500">Şu an uyarı gösterilecek varyantlar (son senkrona göre, eşik {String(live.threshold)}):</p>
                  {lowStock.low.length ? (
                    <ul className="mt-1 divide-y">{lowStock.low.map((v) => <li key={v.sku} className="flex justify-between py-1"><span>{v.productName} <span className="text-xs text-gray-500">{v.sku}</span></span><b className="tabular-nums">{v.currentStock}</b></li>)}</ul>
                  ) : <p className="text-xs text-gray-500">Yok.</p>}
                </div>
              )}
              <p className="text-xs text-gray-500">Satış rakamları modülün etkisini değil, hedeflenen ürünlerin toplam satışını gösterir; ikas siparişlerinde uyarının görülüp görülmediği bilgisi yoktur.</p>
            </div>
          )}
          {orders && <p className="mt-2 text-xs text-gray-500">Dönüşüm oranı = yararlanan sipariş / görüntülenme (oturum). Sipariş verisi son senkrondan gelir.</p>}
          <p className="mt-3 text-xs text-gray-500">
            Görüntülenme oturum başına bir kez sayılır. {mod.statsNote} Önizlemedeki olaylar sayılmaz.
          </p>
        </section>
      </div>

      <Editor key={`${store.id}:${row?.updatedAt?.getTime() ?? 0}`} moduleKey={mod.key} storeId={store.id} initial={shown} version={row?.version ?? 0} loader={loader} hasDraft={row?.draft != null} sources={sources} previewData={previewData} />
    </>
  );
}
