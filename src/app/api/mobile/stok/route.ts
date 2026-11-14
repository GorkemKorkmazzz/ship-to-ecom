import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { withUser } from "@/lib/mobile";

const PER_PAGE = 50;

// GET ?q=<arama>&f=dusuk|tukenen|eslesmeyen&sayfa=1 → SKU başına ortak stok ve mağaza stokları
export const GET = withUser(async (user, req) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim().toLocaleLowerCase("tr");
  const f = sp.get("f");
  const page = Math.max(1, Number(sp.get("sayfa")) || 1);
  const stores = await getStores(user.id);
  const [shared, variants, settings] = await Promise.all([
    db.sharedItem.findMany({ where: { userId: user.id } }),
    db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } }),
    db.skuSetting.findMany({ where: { userId: user.id } }),
  ]);
  const setMap = new Map(settings.map((s) => [s.sku, s]));
  type Row = { sku: string; ad: string; ortak: number | null; magazalar: { id: string; ad: string; stok: number | null }[]; dusuk: boolean; haric: boolean };
  const rows = new Map<string, Row>();
  for (const v of variants) {
    const r = rows.get(v.matchSku) ?? { sku: v.matchSku, ad: v.productName, ortak: null, magazalar: stores.map((s) => ({ id: s.id, ad: s.label, stok: null })), dusuk: false, haric: !!setMap.get(v.matchSku)?.excluded };
    const m = r.magazalar.find((x) => x.id === v.storeId);
    if (m) m.stok = v.currentStock;
    rows.set(v.matchSku, r);
  }
  for (const s of shared) {
    const r = rows.get(s.sku);
    if (!r) continue;
    r.ortak = s.sharedStock;
    const threshold = setMap.get(s.sku)?.lowStockThreshold ?? user.lowStockThreshold;
    r.dusuk = threshold !== null && s.sharedStock <= threshold;
  }
  const all = [...rows.values()].sort((a, b) => a.sku.localeCompare(b.sku, "tr"));
  let list = all;
  if (q) list = list.filter((r) => r.sku.toLocaleLowerCase("tr").includes(q) || r.ad.toLocaleLowerCase("tr").includes(q));
  if (f === "dusuk") list = list.filter((r) => r.dusuk);
  if (f === "tukenen") list = list.filter((r) => r.ortak !== null && r.ortak <= 0);
  if (f === "eslesmeyen") list = list.filter((r) => r.ortak === null && !r.haric);
  return Response.json({
    sayfa: page,
    sayfaSayisi: Math.max(1, Math.ceil(list.length / PER_PAGE)),
    toplam: list.length,
    sayilar: { tum: all.length, dusuk: all.filter((r) => r.dusuk).length, tukenen: all.filter((r) => r.ortak !== null && r.ortak <= 0).length, eslesmeyen: all.filter((r) => r.ortak === null && !r.haric).length },
    urunler: list.slice((page - 1) * PER_PAGE, page * PER_PAGE),
  });
});
