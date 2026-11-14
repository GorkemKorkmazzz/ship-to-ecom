import { assertModule } from "@/lib/access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleApp, googleAuthorizeUrl } from "@/lib/ads/google";
import { randomToken } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

// Google Analytics (GA4) bağlantısını başlatır: tek kullanımlık "state" üretir ve kullanıcıyı Google izin ekranına gönderir.
export async function GET() {
  assertModule(await requireUser(), "ga4");
  if (!googleApp()) redirect(`/reklam-hesaplari?hata=${encodeURIComponent("Google Analytics bağlantısı henüz açık değil (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ve APP_URL tanımlı olmalı).")}`);
  const state = randomToken(32);
  (await cookies()).set("ga4_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/ga4" });
  redirect(googleAuthorizeUrl(state, "ga4"));
}
