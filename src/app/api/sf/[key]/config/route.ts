import { publicConfig } from "@/lib/storefront";

// Mağaza temasındaki betiğin okuduğu herkese açık yapılandırma (gizli bilgi içermez).
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET", Vary: "Origin" };

export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const token = new URL(req.url).searchParams.get("preview");
  const cfg = /^[a-f0-9]{32}$/.test(key) ? await publicConfig(key, token) : null;
  if (!cfg) return Response.json({ error: "bulunamadı" }, { status: 404, headers: CORS });
  return Response.json(cfg, { headers: { ...CORS, "Cache-Control": cfg.preview ? "no-store" : "public, max-age=60" } });
}
