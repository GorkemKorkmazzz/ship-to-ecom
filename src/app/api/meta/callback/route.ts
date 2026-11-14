import { assertModule } from "@/lib/access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { metaExchangeCode, saveMetaIntegration, syncMetaAccounts } from "@/lib/ads/meta";
import { safeEqual } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

const go = (key: "hata" | "ok", msg: string): never => redirect(`/reklam-hesaplari?${key}=${encodeURIComponent(msg)}`);

// Meta onay ekranından dönüş: ?code=…&state=… ya da iptalde ?error=access_denied&error_reason=user_denied
export async function GET(req: Request) {
  const user = await requireUser();
  assertModule(user, "meta");
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("meta_state")?.value ?? "";
  jar.delete({ name: "meta_state", path: "/api/meta" });
  if (url.searchParams.get("error")) go("hata", "Meta bağlantısı iptal edildi ya da izin verilmedi.");
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  // state çerezdekiyle eşleşmezse kod kullanılmaz (başkasının başlattığı bağlantı hesaba eklenmesin).
  if (!code || !state || !expected || !safeEqual(state, expected)) go("hata", "Meta bağlantısı doğrulanamadı. Lütfen yeniden başlatın.");

  let integrationId = "";
  try {
    const x = await metaExchangeCode(code);
    integrationId = (await saveMetaIntegration(user.id, x)).id;
  } catch (e) {
    go("hata", e instanceof Error ? e.message : "Meta bağlantısı kurulamadı.");
  }
  // redirect() bir istisna fırlattığı için try dışında çağrılır.
  let n: number;
  try {
    n = await syncMetaAccounts(integrationId, user.id);
  } catch (e) {
    go("hata", `Meta bağlandı ancak reklam hesapları okunamadı: ${e instanceof Error ? e.message : e}`);
  }
  go("ok", n! ? `Meta bağlandı; ${n!} reklam hesabı bulundu. Raporlamak istediklerinizi seçip sitelere atayın.` : "Meta bağlandı ancak erişilebilen reklam hesabı bulunamadı.");
}
