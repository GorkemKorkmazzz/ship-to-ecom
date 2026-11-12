import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { imageUrl } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { Thumb } from "../thumb";
import { Flash, PageHeader, StoreBadge, SyncButton, fmtDate, fmtMoney } from "../ui";

const PER_PAGE = 30;
const G = "bg-emerald-100 text-emerald-700", A = "bg-amber-100 text-amber-800", R = "bg-red-100 text-red-700", N = "bg-gray-100 text-gray-700", B = "bg-sky-100 text-sky-700";

const ORDER: Record<string, [string, string]> = {
  CREATED: ["Oluşturuldu", N], DRAFT: ["Taslak", N], CANCELLED: ["İptal edildi", R], PARTIALLY_CANCELLED: ["Kısmi iptal", R],
  REFUNDED: ["İade edildi", R], PARTIALLY_REFUNDED: ["Kısmi iade", A], REFUND_REQUESTED: ["İade talebi", A],
  REFUND_REJECTED: ["İade reddedildi", N], WAITING_UPSELL_ACTION: ["Bekliyor", A],
};
const PAYMENT: Record<string, [string, string]> = {
  PAID: ["Ödendi", G], WAITING: ["Ödeme bekliyor", A], PARTIALLY_PAID: ["Kısmi ödendi", A], FAILED: ["Ödeme başarısız", R],
};
const PACKAGE: Record<string, [string, string]> = {
  UNFULFILLED: ["Hazırlanıyor", A], READY_FOR_SHIPMENT: ["Kargoya hazır", B], PARTIALLY_READY_FOR_SHIPMENT: ["Kısmen hazır", B],
  READY_FOR_PICK_UP: ["Teslim alınmaya hazır", B], FULFILLED: ["Kargolandı", B], PARTIALLY_FULFILLED: ["Kısmen kargolandı", B],
  DELIVERED: ["Teslim edildi", G], PARTIALLY_DELIVERED: ["Kısmen teslim", G], UNABLE_TO_DELIVER: ["Teslim edilemedi", R],
  CANCELLED: ["İptal", R], PARTIALLY_CANCELLED: ["Kısmi iptal", R], CANCEL_REQUESTED: ["İptal talebi", A], CANCEL_REJECTED: ["İptal reddedildi", N],
  REFUNDED: ["İade", R], PARTIALLY_REFUNDED: ["Kısmi iade", A], REFUND_REQUESTED: ["İade talebi", A],
  REFUND_REQUEST_ACCEPTED: ["İade kabul edildi", A], REFUND_REJECTED: ["İade reddedildi", N],
};
const FILTERS: [string, string, string[]][] = [
  ["hazirlaniyor", "Hazırlanıyor", ["UNFULFILLED", "READY_FOR_SHIPMENT", "PARTIALLY_READY_FOR_SHIPMENT", "READY_FOR_PICK_UP"]],
  ["kargoda", "Kargoda", ["FULFILLED", "PARTIALLY_FULFILLED"]],
  ["teslim", "Teslim edildi", ["DELIVERED", "PARTIALLY_DELIVERED"]],
  ["iptal-iade", "İptal / iade", Object.keys(PACKAGE).filter((k) => /CANCEL|REFUND|UNABLE/.test(k))],
];

function Status({ map, value }: { map: Record<string, [string, string]>; value: string | null }) {
  if (!value) return null;
  const [label, cls] = map[value] ?? [value, N];
  return <span className={`badge whitespace-nowrap ${cls}`}>{label}</span>;
}

type Pkg = { number: string; barcode: string | null; cargoCompany: string | null; trackingNumber: string | null; trackingLink: string | null };
const parsePackages = (json: string): Pkg[] => {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
};
const safeLink = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; magaza?: string; sayfa?: string; durum?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  const page = Math.max(1, Number(sp.sayfa) || 1);
  const selected = stores.find((s) => s.id === sp.magaza);
  const filter = FILTERS.find((f) => f[0] === sp.durum);
  const q = (sp.q ?? "").trim().replace(/^#/, "");
  const where: Prisma.OrderWhereInput = {
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
        <form className="ml-auto flex gap-2">
          {selected && <input type="hidden" name="magaza" value={selected.id} />}
          {filter && <input type="hidden" name="durum" value={filter[0]} />}
          <input className="input w-56" name="q" defaultValue={q} placeholder="Sipariş no, SKU veya barkod" />
          <button className="btn-ghost">Ara</button>
        </form>
      </div>

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
