import { rateLimited } from "@/lib/storefront";
import { publicFlash } from "@/lib/storefront/flash";

// Flash Ürünler vitrin akışı: ürün adı, görsel, fiyat ve stok ikas'tan senkronlanan verilerdir.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(key)) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  if (rateLimited(ip)) return new Response(null, { status: 429, headers: CORS });
  const feed = await publicFlash(key);
  if (!feed) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  return Response.json({ campaigns: feed }, { headers: { ...CORS, "Cache-Control": "public, max-age=60" } });
}
