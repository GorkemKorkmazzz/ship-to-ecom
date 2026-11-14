import { assertModule } from "@/lib/access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { syncGa4Properties } from "@/lib/ads/ga4";
import { googleExchangeCode, saveGoogleIntegration } from "@/lib/ads/google";
import { safeEqual } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

const go = (key: "hata" | "ok", msg: string): never => redirect(`/reklam-hesaplari?${key}=${encodeURIComponent(msg)}`);

// Google izin ekranından dönüş (GA4, salt okuma).
export async function GET(req: Request) {
  const user = await requireUser();
  assertModule(user, "ga4");
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("ga4_state")?.value ?? "";
  jar.delete({ name: "ga4_state", path: "/api/ga4" });
  if (url.searchParams.get("error")) go("hata", "Google Analytics bağlantısı iptal edildi ya da izin verilmedi.");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state || !expected || !safeEqual(state, expected)) go("hata", "Google Analytics bağlantısı doğrulanamadı. Lütfen yeniden başlatın.");

  let integrationId = "";
  try {
    integrationId = (await saveGoogleIntegration(user.id, await googleExchangeCode(code, "ga4"), "ga4")).id;
  } catch (e) {
    go("hata", e instanceof Error ? e.message : "Google Analytics bağlantısı kurulamadı.");
  }
  // redirect() bir istisna fırlattığı için try dışında çağrılır.
  let n = 0, listError = "";
  try {
    n = await syncGa4Properties(integrationId, user.id);
  } catch (e) {
    listError = e instanceof Error ? e.message : String(e);
  }
  if (listError) go("hata", `Google Analytics bağlandı ancak mülk listesi alınamadı (${listError}). Mülk kimliğini elle ekleyebilirsiniz.`);
  go("ok", n ? `Google Analytics bağlandı; ${n} mülk bulundu. Her mülkü ilgili siteye atayın.` : "Google Analytics bağlandı ancak erişilebilen mülk bulunamadı. Mülk kimliğini elle ekleyebilirsiniz.");
}
