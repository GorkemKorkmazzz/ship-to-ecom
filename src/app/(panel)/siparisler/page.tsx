import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { ORDER_FILTERS, ORDER_STATUS, PACKAGE_STATUS, PAYMENT_STATUS, statusOf, type Tone } from "@/lib/status";
import { Thumb } from "../thumb";
import { Flash, PageHeader, StoreBadge, SyncButton, fmtDate, fmtMoney } from "../ui";
import { deleteOrders, restoreOrders, updateOrder } from "./actions";
import { BulkBar, ConfirmButton } from "./bulk";
import { OrderTabs } from "./tabs";

const PER_PAGE = 30;
const TONE: Record<Tone, string> = { green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700", gray: "bg-gray-100 text-gray-700", sky: "bg-sky-100 text-sky-700" };
const ORDER = ORDER_STATUS, PAYMENT = PAYMENT_STATUS, PACKAGE = PACKAGE_STATUS, FILTERS = ORDER_FILTERS;

function Status({ map, value }: { map: Record<string, [string, Tone]>; value: string | null }) {
  const st = statusOf(map, value);
  if (!st) return null;
  return <span className={`badge whitespace-nowrap ${TONE[st.tone]}`}>{st.label}</span>;
}

type Pkg = { id?: string | null; status?: string | null; number: string; barcode: string | null; cargoCompany: string | null; trackingNumber: string | null; trackingLink: string | null };
const parsePackages = (json: string): Pkg[] => {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
};
const parseTags = (json: string): string[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};
const safeLink = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; magaza?: string; sayfa?: string; durum?: string; q?: string; silinen?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const selected = stores.find((s) => s.id === sp.magaza);
  const filter = FILTERS.find((f) => f[0] === sp.durum);
  const q = (sp.q ?? "").trim().replace(/^#/, "");
  const trash = sp.silinen === "1";
  const where: Prisma.OrderWhereInput = {
    deletedAt: trash ? { not: null } : null,
    storeId: selected ? selected.id : { in: stores.map((s) => s.id) },
    ...(filter ? { packageStatus: { in: filter[2] } } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q } }, { lines: { some: { OR: [{ sku: { contains: q } }, { name: { contains: q } }] } } }, { packages: { contains: q } }] } : {}),
  };
  const [orders, count] = await Promise.all([
    db.order.findMany({ where, include: { lines: true }, orderBy: { orderedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.order.count({ where }),
  ]);

  const link = (patch: { magaza?: string | null; durum?: string | null; sayfa?: number }) => {
    const p = new URLSearchParams();
    const magaza = patch.magaza === undefined ? selected?.id : patch.magaza;
    const durum = patch.durum === undefined ? filter?.[0] : patch.durum;
    if (magaza) p.set("magaza", magaza);
    if (durum) p.set("durum", durum);
    if (q) p.set("q", q);
    if (trash) p.set("silinen", "1");
    if (patch.sayfa && patch.sayfa > 1) p.set("sayfa", String(patch.sayfa));
    const s = p.toString();
    return s ? `/siparisler?${s}` : "/siparisler";
  };
  const pill = (active: boolean) =>
    `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`;

  return (
    <>
      <PageHeader title="Siparişler" desc={`${count} sipariş · müşteri bilgileri alınmaz`}>
        <SyncButton path="/siparisler" />
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />
      <OrderTabs active="siparisler" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ magaza: null })} className={pill(!selected)}>Tüm mağazalar</Link>
          {stores.map((s) => (
            <Link key={s.id} href={link({ magaza: s.id })} className={pill(selected?.id === s.id)}>{s.label}</Link>
          ))}
        </div>
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-white p-1">
          <Link href={link({ durum: null })} className={pill(!filter)}>Tümü</Link>
          {FILTERS.map(([key, label]) => (
            <Link key={key} href={link({ durum: key })} className={pill(filter?.[0] === key)}>{label}</Link>
          ))}
        </div>
        <Link href={trash ? "/siparisler" : "/siparisler?silinen=1"} className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${trash ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
          {trash ? "← Siparişlere dön" : "Silinenler"}
        </Link>
        <form className="ml-auto flex gap-2">
          {selected && <input type="hidden" name="magaza" value={selected.id} />}
          {filter && <input type="hidden" name="durum" value={filter[0]} />}
          <input className="input w-56" name="q" defaultValue={q} placeholder="Sipariş no, SKU veya barkod" />
          <button className="btn-ghost">Ara</button>
        </form>
      </div>

      <form id="bulk" action={trash ? restoreOrders : deleteOrders}>
        <input type="hidden" name="back" value={link({ sayfa: page })} />
        <BulkBar trash={trash} total={orders.length} />
      </form>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,0.9fr)] gap-4 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 lg:grid">
          <span>Sipariş</span>
          <span>Tarih</span>
          <span>Durum</span>
          <span>Kargo</span>
          <span className="text-right">Tutar</span>
        </div>
        {orders.map((o) => {
          const i = stores.findIndex((s) => s.id === o.storeId);
          const store = stores[i];
          const pkgs = parsePackages(o.packages);
          const first = pkgs.find((p) => p.barcode || p.trackingNumber) ?? pkgs[0];
          const code = first?.barcode ?? first?.trackingNumber ?? null;
          const units = o.lines.reduce((a, l) => a + l.quantity, 0);
          return (
            <details key={o.id} className="group border-b border-gray-100 last:border-b-0">
              <summary className="grid cursor-pointer list-none grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 hover:bg-gray-50 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.5fr)_minmax(0,0.9fr)] lg:items-center [&::-webkit-details-marker]:hidden">
                <div className="flex min-w-0 items-center gap-3">
                  <input type="checkbox" form="bulk" name="ids" value={o.id} aria-label={`#${o.orderNumber} seç`} className="h-4 w-4 shrink-0" />
                  <div className="flex shrink-0 -space-x-3">
                    {o.lines.slice(0, 3).map((l) => (
                      <Thumb key={l.id} src={imageUrl(store.merchantId, l.imageId)} alt={l.name || l.sku} size={44} />
                    ))}
                    {o.lines.length > 3 && (
                      <span className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">+{o.lines.length - 3}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">#{o.orderNumber}</span>
                      <StoreBadge label={store.label} index={i} />
                    </div>
                    <div className="truncate text-xs text-gray-500">{units} adet · {o.lines.map((l) => l.name || l.sku).join(", ")}</div>
                  </div>
                </div>
                <div className="whitespace-nowrap text-sm text-gray-600">{fmtDate(o.orderedAt)}</div>
                <div className="flex flex-wrap gap-1">
                  {o.status !== "CREATED" && <Status map={ORDER} value={o.status} />}
                  <Status map={PAYMENT} value={o.paymentStatus} />
                  <Status map={PACKAGE} value={o.packageStatus} />
                  {parseTags(o.tags).map((t) => <span key={t} className="badge whitespace-nowrap bg-indigo-100 text-indigo-700">#{t}</span>)}
                </div>
                <div className="min-w-0 text-sm">
                  {code ? (
                    <>
                      <div className="truncate text-xs text-gray-500">{first?.cargoCompany ?? "Kargo"}</div>
                      <div className="truncate font-mono text-[13px] font-medium">{code}</div>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">Kargo barkodu henüz yok</span>
                  )}
                </div>
                <div className="whitespace-nowrap font-semibold tabular-nums lg:text-right">{fmtMoney(o.totalFinalPrice, o.currency)}</div>
              </summary>

              <div className="grid gap-4 border-t border-gray-100 bg-gray-50 px-4 py-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ürünler</h3>
                  <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                    {o.lines.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <Thumb src={imageUrl(store.merchantId, l.imageId)} alt={l.name || l.sku} size={48} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{l.name || "—"}</div>
                          <div className="font-mono text-xs text-gray-400">{l.sku}</div>
                        </div>
                        <div className="tabular-nums text-gray-600">{l.quantity} adet</div>
                        <div className="w-24 text-right font-medium tabular-nums">{l.finalPrice !== null ? fmtMoney(l.finalPrice * l.quantity, o.currency) : "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Kargo</h3>
                  <div className="space-y-2">
                    {pkgs.map((p) => {
                      const url = safeLink(p.trackingLink);
                      return (
                        <div key={p.number} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{p.cargoCompany ?? "Kargo firması belirtilmemiş"}</span>
                            <span className="text-xs text-gray-400">Paket {p.number}</span>
                          </div>
                          <dl className="mt-2 space-y-1 text-xs">
                            <div className="flex justify-between gap-2"><dt className="text-gray-500">Barkod</dt><dd className="select-all font-mono">{p.barcode ?? "—"}</dd></div>
                            <div className="flex justify-between gap-2"><dt className="text-gray-500">Takip no</dt><dd className="select-all font-mono">{p.trackingNumber ?? "—"}</dd></div>
                          </dl>
                          {url && <a className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:underline" href={url} target="_blank" rel="noreferrer">Kargo takibini aç →</a>}
                        </div>
                      );
                    })}
                    <form action={trash ? restoreOrders : deleteOrders} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3 text-sm">
                      <input type="hidden" name="ids" value={o.id} />
                      <input type="hidden" name="back" value={link({ sayfa: page })} />
                      <span className="text-gray-600">{trash ? "Bu sipariş silinmiş." : "Siparişi panelden kaldır"}</span>
                      {trash ? <button className="btn-ghost">Geri al</button> : <ConfirmButton message={`#${o.orderNumber} numaralı sipariş panelden silinsin mi? Mağazadaki sipariş etkilenmez.`}>Sil</ConfirmButton>}
                    </form>
                    <form action={updateOrder} hidden={trash} className="rounded-lg border border-indigo-200 bg-white p-3 text-sm">
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="back" value={link({ sayfa: page })} />
                      <div className="font-medium">Durumu güncelle</div>
                      <p className="text-xs text-gray-500">Değişiklik doğrudan ikas&apos;a yazılır.</p>
                      <select className="input mt-2" name="action" defaultValue="" required>
                        <option value="" disabled>İşlem seçin</option>
                        <option value="hazir">Kargoya hazır</option>
                        <option value="kargolandi">Kargolandı</option>
                        <option value="teslim">Teslim edildi</option>
                        <option value="iptal">Siparişi iptal et</option>
                      </select>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <input className="input" name="cargoCompany" placeholder="Kargo firması" defaultValue={first?.cargoCompany ?? ""} />
                        <input className="input" name="trackingNumber" placeholder="Takip no" defaultValue={first?.trackingNumber ?? ""} />
                      </div>
                      <input className="input mt-2" name="trackingLink" placeholder="Takip bağlantısı (https://…)" defaultValue={safeLink(first?.trackingLink ?? null) ?? ""} />
                      <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" name="notify" /> ikas müşteriye bildirim göndersin</label>
                      <details className="mt-2 text-xs text-gray-600">
                        <summary className="cursor-pointer">İptal seçenekleri</summary>
                        <label className="mt-1 flex items-center gap-2"><input type="checkbox" name="restock" defaultChecked /> Ürünleri stoğa geri ekle</label>
                        <label className="mt-1 flex items-center gap-2 text-red-700"><input type="checkbox" name="confirm" /> İptali onaylıyorum (geri alınamaz)</label>
                      </details>
                      <button className="btn mt-3 w-full">ikas&apos;ta güncelle</button>
                    </form>
                    {!pkgs.length && <p className="rounded-lg border border-dashed border-gray-300 bg-white p-3 text-xs text-gray-500">ikas&apos;ta bu sipariş için henüz paket oluşturulmamış. Barkod, ikas&apos;ta kargo etiketi oluşunca senkronla gelir.</p>}
                  </div>
                </div>
              </div>
            </details>
          );
        })}
        {!orders.length && <p className="px-4 py-10 text-center text-sm text-gray-500">Sipariş bulunamadı.</p>}
      </div>

      {count > PER_PAGE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="btn-ghost" href={link({ sayfa: page - 1 })}>← Önceki</Link> : <span />}
          <span className="text-gray-500">Sayfa {page} / {Math.ceil(count / PER_PAGE)}</span>
          {page * PER_PAGE < count ? <Link className="btn-ghost" href={link({ sayfa: page + 1 })}>Sonraki →</Link> : <span />}
        </div>
      )}
    </>
  );
}
