import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

// Ürün listesini CSV olarak indirir (Excel'de açılır). Toplu güncelleme şablonu olarak da kullanılabilir.
export async function GET() {
  const userId = await getUserId();
  if (!userId) return new Response("unauthorized", { status: 401 });
  const stores = await db.store.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  const variants = await db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  const shared = new Map((await db.sharedItem.findMany({ where: { userId } })).map((s) => [s.sku, s.sharedStock]));
  const bySku = new Map<string, typeof variants>();
  for (const v of variants) bySku.set(v.matchSku, [...(bySku.get(v.matchSku) ?? []), v]);

  const head = ["sku", "urun_adi", "stok", "satis_fiyati", "indirimli_fiyat", "alis_fiyati", ...stores.flatMap((s) => [`${s.label}_stok`, `${s.label}_satis`])];
  const rows = [...bySku.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "tr"))
    .map(([sku, list]) => {
      const main = list.find((v) => v.storeId === stores[0]?.id) ?? list[0];
      return [
        sku, main.productName, shared.get(sku) ?? "", main.sellPrice, main.discountPrice, main.buyPrice,
        ...stores.flatMap((s) => {
          const v = list.find((x) => x.storeId === s.id);
          return [v?.currentStock ?? "", v?.sellPrice ?? ""];
        }),
      ];
    });
  return new Response(toCsv(head, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ikiz-urunler.csv"' },
  });
}
