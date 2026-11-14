import { buildAnalysis, parseRange } from "@/lib/analysis";
import { hasModule } from "@/lib/access";
import { apiError, withUser } from "@/lib/mobile";

// GET ?baslangic=YYYY-AA-GG&bitis=YYYY-AA-GG&hedef=30 → kârlılık ve stok analizi
export const GET = withUser(async (user, req) => {
  if (!hasModule(user, "karlilik")) return apiError(403, "Kârlılık analizi Profesyonel paketinde.");
  const sp = new URL(req.url).searchParams;
  const cover = Math.min(180, Math.max(7, Number(sp.get("hedef")) || 30));
  return Response.json(await buildAnalysis(user.id, parseRange(sp.get("baslangic"), sp.get("bitis")), cover));
});
