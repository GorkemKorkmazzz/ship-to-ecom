import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken, safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { storeLimitOf } from "@/lib/plans";
import { exchangeInstallCode } from "@/lib/platforms/tsoft";
import { requireUser } from "@/lib/session";

const go = (key: "hata" | "ok", msg: string): never => redirect(`/magazalar?${key}=${encodeURIComponent(msg)}`);

// T-Soft onay ekranından dönüş: ?code=…&store=…&domain=…&state=…
// "state" çerezdekiyle eşleşmezse kod kullanılmaz (başkasının başlattığı kurulum hesaba bağlanmasın).
export async function GET(req: Request) {
  const user = await requireUser();
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const jar = await cookies();
  const expected = jar.get("tsoft_state")?.value ?? "";
  jar.delete({ name: "tsoft_state", path: "/api/tsoft" });
  if (!code || !state || !expected || !safeEqual(state, expected)) go("hata", "T-Soft bağlantısı doğrulanamadı. Lütfen Mağazalar sayfasından yeniden başlatın.");

  let info;
  try {
    info = await exchangeInstallCode(code);
  } catch (e) {
    go("hata", e instanceof Error ? e.message : "T-Soft bağlantısı kurulamadı.");
  }
  const { storeId, domain } = info!;
  const existing = await db.store.findUnique({ where: { userId_storeName: { userId: user.id, storeName: domain } } });
  if (existing) {
    // Yeniden kurulum: kimliği güncelle, eski token'ı at.
    await db.store.update({ where: { id: existing.id }, data: { platform: "tsoft", externalId: storeId, accessToken: null, tokenExpiresAt: null, lastError: null } });
    go("ok", `${domain} yeniden bağlandı.`);
  }
  if ((await db.store.count({ where: { userId: user.id } })) >= storeLimitOf(user.plan)) go("hata", "Paketinizin mağaza hakkı doldu. Daha fazla mağaza için lütfen paketinizi değiştirin.");
  await db.store.create({
    data: { userId: user.id, platform: "tsoft", label: domain, storeName: domain, externalId: storeId, clientId: "", clientSecretEnc: "", webhookSecret: randomToken() },
  });
  go("ok", "T-Soft mağazası bağlandı. Stokların eşitlenmesi için “Şimdi senkronize et”e basın.");
}
