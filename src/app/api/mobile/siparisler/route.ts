import type { Prisma } from "@prisma/client";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { withUser } from "@/lib/mobile";
import { imageUrl } from "@/lib/pricing";
import { ORDER_FILTERS, ORDER_STATUS, PACKAGE_STATUS, PAYMENT_STATUS, statusOf } from "@/lib/status";

const PER_PAGE = 30;
type Pkg = { number: string; barcode: string | null; cargoCompany: string | null; trackingNumber: string | null; trackingLink: string | null };
const safeLink = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

// GET ?magaza=<id>&durum=hazirlaniyor|kargoda|teslim|iptal-iade&q=<arama>&sayfa=1
// Müşteri adı, e-posta, telefon ve açık adres veritabanında yoktur; yanıtta da olmaz.
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const stores = await getStores(user.id);
  const page = Math.max(1, Number(sp.get("sayfa")) || 1);
  const selected = stores.find((s) => s.id === sp.get("magaza"));
  const filter = ORDER_FILTERS.find((f) => f[0] === sp.get("durum"));
  const q = (sp.get("q") ?? "").trim().replace(/^#/, "");
  const where: Prisma.OrderWhereInput = {
    deletedAt: null,
    storeId: selected ? selected.id : { in: stores.map((s) => s.id) },
    ...(filter ? { packageStatus: { in: filter[2] } } : {}),
    ...(q ? { OR: [{ orderNumber: { contains: q } }, { lines: { some: { OR: [{ sku: { contains: q } }, { name: { contains: q } }] } } }] } : {}),
  };
  const [orders, count] = await Promise.all([
    db.order.findMany({ where, include: { lines: true }, orderBy: { orderedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.order.count({ where }),
  ]);
  return Response.json({
    sayfa: page,
    sayfaSayisi: Math.max(1, Math.ceil(count / PER_PAGE)),
    toplam: count,
    filtreler: ORDER_FILTERS.map(([anahtar, ad]) => ({ anahtar, ad })),
    siparisler: orders.map((o) => {
      const store = stores.find((s) => s.id === o.storeId)!;
      let pkgs: Pkg[] = [];
      try {
        pkgs = JSON.parse(o.packages);
      } catch {}
      return {
        id: o.id,
        numara: o.orderNumber,
        magaza: { id: store.id, ad: store.label },
        tarih: o.orderedAt,
        tutar: o.totalFinalPrice,
        paraBirimi: o.currency,
        durum: statusOf(ORDER_STATUS, o.status),
        odeme: statusOf(PAYMENT_STATUS, o.paymentStatus),
        paket: statusOf(PACKAGE_STATUS, o.packageStatus),
        kargoYontemi: o.shippingMethod,
        il: o.city,
        ilce: o.district,
        kargolar: pkgs.map((p) => ({ numara: p.number, barkod: p.barcode, firma: p.cargoCompany, takipNo: p.trackingNumber, takipLinki: safeLink(p.trackingLink) })),
        satirlar: o.lines.map((l) => ({ sku: l.sku, ad: l.name, adet: l.quantity, fiyat: l.finalPrice, gorsel: imageUrl(store.merchantId, l.imageId) })),
      };
    }),
  });
});
