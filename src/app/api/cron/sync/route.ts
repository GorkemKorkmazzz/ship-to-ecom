import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
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
  return Response.json({ users: users.length, failed });
}
