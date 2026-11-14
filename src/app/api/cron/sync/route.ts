import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { hasModule } from "@/lib/access";
import { syncAllAds } from "@/lib/ads/sync";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

// Periyodik güvenlik ağı: kaçan webhook'ları telafi eder.
// Çağrı: Authorization: Bearer <CRON_SECRET>
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || !safeEqual(secret, given)) return new Response("unauthorized", { status: 401 });
  const users = await db.user.findMany({ where: { stores: { some: {} } }, select: { id: true } });
  let failed = 0;
  for (const u of users) {
    try {
      await syncUser(u.id);
    } catch (e) {
      failed++;
      console.error("cron sync", u.id, e);
    }
  }
  // Reklam verisi: seçili Meta / Google Ads hesabı olan kullanıcılar (30 dakikalık önbellek süresi içinde tekrar çağrılmaz).
  const adUsers = await db.user.findMany({ where: { adIntegrations: { some: { status: "active", OR: [{ accounts: { some: { selected: true } } }, { properties: { some: { websiteId: { not: null } } } }] } } }, select: { id: true, plan: true, suspended: true, paidUntil: true, trialEndsAt: true } });
  let adErrors = 0;
  for (const u of adUsers) {
    // Paketi reklam modüllerini kapsamayan hesabın reklam verisi çekilmez (gereksiz API çağrısı da yapılmaz).
    if (!hasModule(u, "reklam")) continue;
    try {
      adErrors += (await syncAllAds(u.id)).errors.length;
    } catch (e) {
      adErrors++;
      console.error("cron ads", u.id, e);
    }
  }
  return Response.json({ users: users.length, failed, adUsers: adUsers.length, adErrors });
}
