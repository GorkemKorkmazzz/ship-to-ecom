import { rateLimited } from "@/lib/storefront";
import { publicLabels } from "@/lib/storefront/labels";

// Ürün Etiketleri vitrin verisi: ürün kimliği → etiketler ve ürün kimliği → vitrin bağlantısı. 5 dk önbellek.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" };

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(key)) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  if (rateLimited(ip)) return new Response(null, { status: 429, headers: CORS });
  const data = await publicLabels(key);
  if (!data) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  return Response.json(data, { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });
}
