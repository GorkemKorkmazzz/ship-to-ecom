import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { hasBiggerPlan, storeLimitOf } from "@/lib/plans";
import { installUrl, tsoftApp } from "@/lib/platforms/tsoft";
import { requireUser } from "@/lib/session";

const fail = (msg: string): never => redirect(`/magazalar?hata=${encodeURIComponent(msg)}`);

// T-Soft bağlantısını başlatır: tek kullanımlık "state" üretir ve mağaza sahibini
// T-Soft panelindeki onay ekranına gönderir. Onaydan sonra /api/tsoft/callback çağrılır.
export async function GET() {
  const user = await requireUser();
  if (!tsoftApp()) fail("T-Soft bağlantısı henüz açık değil (uygulama anahtarları tanımlı değil).");
  const limit = storeLimitOf(user.plan);
  if ((await db.store.count({ where: { userId: user.id } })) >= limit)
    fail(hasBiggerPlan(user.plan) ? `Paketinizde en fazla ${limit} mağaza bağlanabilir. Daha fazla mağaza için lütfen paketinizi değiştirin.` : `Paketinizin mağaza hakkı (${limit}) doldu.`);
  const state = randomToken(32);
  (await cookies()).set("tsoft_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/tsoft" });
  redirect(installUrl(state));
}
