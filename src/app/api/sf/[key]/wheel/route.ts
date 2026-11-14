import { rateLimited } from "@/lib/storefront";
import { spin } from "@/lib/storefront/wheel";

// Hediye Çarkı çevirme ucu. Ödül sunucuda seçilir; tarayıcı yalnızca sonucu gösterir.
// text/plain gövde: CORS ön isteği gerekmez. Gövde en fazla 2 KB.
const CORS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" };

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(key)) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  if (rateLimited(`cark:${ip}`, 10)) return Response.json({ error: "Çok fazla deneme. Biraz sonra tekrar deneyin." }, { status: 429, headers: CORS });
  const text = await req.text();
  if (text.length > 2048) return Response.json({ error: "geçersiz" }, { status: 413, headers: CORS });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "geçersiz" }, { status: 400, headers: CORS });
  }
  const r = await spin(key, body, ip);
  if (!r.ok) return Response.json({ error: r.error, repeat: r.repeat ?? false }, { status: r.status, headers: CORS });
  return Response.json({ index: r.index, key: r.key, label: r.label, type: r.type, code: r.code }, { headers: CORS });
}
