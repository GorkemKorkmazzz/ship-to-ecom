import { assertModule } from "@/lib/access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleExchangeCode, saveGoogleIntegration, syncGoogleAccounts } from "@/lib/ads/google";
import { safeEqual } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

const go = (key: "hata" | "ok", msg: string): never => redirect(`/reklam-hesaplari?${key}=${encodeURIComponent(msg)}`);

// Google izin ekranından dönüş: ?code=…&state=… ya da reddedilirse ?error=access_denied
export async function GET(req: Request) {
  const user = await requireUser();
  assertModule(user, "google");
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("google_state")?.value ?? "";
  jar.delete({ name: "google_state", path: "/api/google" });
  if (url.searchParams.get("error")) go("hata", "Google bağlantısı iptal edildi ya da izin verilmedi.");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!code || !state || !expected || !safeEqual(state, expected)) go("hata", "Google bağlantısı doğrulanamadı. Lütfen yeniden başlatın.");

  let integrationId = "";
  try {
    integrationId = (await saveGoogleIntegration(user.id, await googleExchangeCode(code))).id;
  } catch (e) {
    go("hata", e instanceof Error ? e.message : "Google bağlantısı kurulamadı.");
  }
  // redirect() bir istisna fırlattığı için try dışında çağrılır.
  let n = 0;
  try {
    n = await syncGoogleAccounts(integrationId, user.id);
  } catch (e) {
    go("hata", `Google bağlandı ancak reklam hesapları okunamadı: ${e instanceof Error ? e.message : e}`);
  }
  go("ok", n ? `Google Ads bağlandı; ${n} reklam hesabı bulundu. Raporlamak istediklerinizi seçip sitelere atayın.` : "Google Ads bağlandı ancak erişilebilen reklam hesabı bulunamadı.");
}
