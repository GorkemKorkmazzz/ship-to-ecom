import { db } from "@/lib/db";
import { rateLimited } from "@/lib/storefront";

// Tükenmek Üzere: sayfa açıkken stok tazeleme. Panelin ikas Admin API'den (senkron/webhook) aldığı son varyant stokları
// ve senkron zamanı döner; betik bu değeri yalnızca sayfa yüklendikten SONRA senkronlanmışsa kullanır.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const productId = new URL(req.url).searchParams.get("p") ?? "";
  if (!/^[a-f0-9]{32}$/.test(key) || !/^[A-Za-z0-9-]{1,64}$/.test(productId)) return Response.json({ error: "geçersiz" }, { status: 400, headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  if (rateLimited(ip)) return new Response(null, { status: 429, headers: CORS });
  const store = await db.store.findUnique({ where: { sfKey: key }, select: { id: true, sfModules: { where: { moduleKey: "tukenmek-uzere", enabled: true }, select: { id: true } } } });
  if (!store || !store.sfModules.length) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  const rows = await db.storeVariant.findMany({ where: { storeId: store.id, productId }, select: { variantId: true, currentStock: true, updatedAt: true } });
  const syncedAt = rows.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0);
  return Response.json(
    { syncedAt, stocks: Object.fromEntries(rows.map((r) => [r.variantId, r.currentStock])) },
    { headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}
