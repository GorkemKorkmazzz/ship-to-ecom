import { rateLimited, recordEvents } from "@/lib/storefront";

// Vitrin olayları. sendBeacon text/plain gönderir (CORS ön isteği olmadan); gövde en fazla 8 KB.
const CORS = { "Access-Control-Allow-Origin": "*" };

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(key)) return new Response(null, { status: 404, headers: CORS });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "yerel";
  if (rateLimited(ip)) return new Response(null, { status: 429, headers: CORS });
  const text = await req.text();
  if (text.length > 8192) return new Response(null, { status: 413, headers: CORS });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400, headers: CORS });
  }
  await recordEvents(key, body);
  return new Response(null, { status: 204, headers: CORS });
}
