"use server";

import { assertModule } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addGa4Property, syncGa4Properties } from "@/lib/ads/ga4";
import { revokeGoogle, syncGoogleAccounts } from "@/lib/ads/google";
import { revokeMeta, syncMetaAccounts } from "@/lib/ads/meta";
import { syncAllAds } from "@/lib/ads/sync";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const BASE = "/reklam-hesaplari";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "hata" | "ok", msg: string): never => redirect(`${BASE}?${key}=${encodeURIComponent(msg)}`);

export async function refreshAccounts(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "meta");
  let n = 0;
  try {
    const integ = await db.adIntegration.findFirst({ where: { id: str(fd, "id"), userId: user.id }, select: { id: true, provider: true, externalUserId: true } });
    if (!integ) throw new Error("Bağlantı bulunamadı.");
    if (integ.externalUserId.startsWith("demo-")) throw new Error("Demo bağlantı: platforma istek gönderilmez, hesaplar demo verisidir.");
    n = integ.provider === "google" ? await syncGoogleAccounts(integ.id, user.id) : integ.provider === "ga4" ? await syncGa4Properties(integ.id, user.id) : await syncMetaAccounts(integ.id, user.id);
  } catch (e) {
    revalidatePath(BASE);
    go("hata", e instanceof Error ? e.message : "Hesaplar yenilenemedi.");
  }
  revalidatePath(BASE);
  go("ok", `Hesaplar yenilendi (${n} hesap).`);
}

/** Seçili hesapların reklam verisini hemen çeker (önbellek süresi beklenmez). */
export async function refreshMetrics() {
  const user = await requireUser();
  assertModule(user, "meta");
  const r = await syncAllAds(user.id, true);
  revalidatePath(BASE);
  if (!r.accounts) go("hata", "Raporlamaya dahil edilmiş reklam hesabı yok. Önce bir hesabı seçip kaydedin.");
  if (r.errors.length) go("hata", `${r.accounts - r.errors.length} hesap güncellendi. Hatalar: ${r.errors.join(" · ")}`.slice(0, 600));
  go("ok", `${r.accounts} hesabın reklam verisi güncellendi (${r.rows} günlük kampanya satırı).`);
}

/** Bağlantıyı kaldırır: Meta'daki izin geri alınmaya çalışılır, token ve hesaplar silinir. */
export async function disconnect(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "meta");
  const integ = await db.adIntegration.findFirst({ where: { id: str(fd, "id"), userId: user.id } });
  if (!integ) go("hata", "Bağlantı bulunamadı.");
  if (integ!.provider === "meta") await revokeMeta(integ!.accessTokenEnc, integ!.externalUserId);
  if (integ!.provider === "google" || integ!.provider === "ga4") await revokeGoogle(integ!.refreshTokenEnc);
  await db.adIntegration.delete({ where: { id: integ!.id } });
  revalidatePath(BASE);
  go("ok", "Bağlantı kaldırıldı.");
}

/** Hesabın raporlamaya dahil olup olmadığını ve bağlı sitelerini kaydeder. Siteler yalnızca kullanıcının kendi siteleri olabilir. */
export async function saveAccount(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "meta");
  const acc = await db.adAccount.findFirst({ where: { id: str(fd, "id"), integration: { userId: user.id } } });
  if (!acc) go("hata", "Reklam hesabı bulunamadı.");
  const wanted = fd.getAll("websiteIds").map(String);
  const sites = await db.website.findMany({ where: { userId: user.id, id: { in: wanted } }, select: { id: true } });
  await db.$transaction([
    db.adAccount.update({ where: { id: acc!.id }, data: { selected: fd.get("selected") === "on" } }),
    db.websiteAdAccount.deleteMany({ where: { adAccountId: acc!.id } }),
    db.websiteAdAccount.createMany({ data: sites.map((s) => ({ websiteId: s.id, adAccountId: acc!.id })) }),
  ]);
  revalidatePath(BASE);
  revalidatePath("/siteler");
  go("ok", `${acc!.name} kaydedildi.`);
}

/** GA4 mülk kimliğini elle ekler; Data API'ye küçük bir sorgu atılarak erişim doğrulanır. */
export async function addProperty(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "meta");
  let name = "";
  try {
    const integ = await db.adIntegration.findFirst({ where: { id: str(fd, "integrationId"), userId: user.id }, select: { externalUserId: true } });
    if (integ?.externalUserId.startsWith("demo-")) throw new Error("Demo bağlantı: Google'a istek gönderilmez.");
    name = (await addGa4Property(str(fd, "integrationId"), user.id, str(fd, "propertyId"))).name;
  } catch (e) {
    go("hata", e instanceof Error ? e.message : "Mülk eklenemedi.");
  }
  revalidatePath(BASE);
  go("ok", `${name} eklendi. Şimdi bir siteye atayın.`);
}

/** Mülkü bir siteye atar (bir siteye tek mülk). Site ve mülk yalnızca kullanıcının kendisine ait olabilir. */
export async function saveProperty(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "meta");
  const p = await db.analyticsProperty.findFirst({ where: { id: str(fd, "id"), integration: { userId: user.id } } });
  if (!p) go("hata", "Mülk bulunamadı.");
  const websiteId = str(fd, "websiteId") || null;
  if (websiteId && !(await db.website.findFirst({ where: { id: websiteId, userId: user.id }, select: { id: true } }))) go("hata", "Site bulunamadı.");
  const taken = websiteId ? await db.analyticsProperty.findFirst({ where: { websiteId, NOT: { id: p!.id } }, select: { name: true } }) : null;
  if (taken) go("hata", `Bu siteye zaten bir mülk bağlı (${taken.name}). Önce onu kaldırın.`);
  await db.analyticsProperty.update({ where: { id: p!.id }, data: { websiteId } });
  revalidatePath(BASE);
  revalidatePath("/siteler");
  go("ok", websiteId ? `${p!.name} siteye atandı; veriler bir sonraki güncellemede çekilecek.` : `${p!.name} siteden ayrıldı.`);
}
