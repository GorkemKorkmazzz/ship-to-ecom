import { assertModule } from "@/lib/access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { metaApp, metaAuthorizeUrl } from "@/lib/ads/meta";
import { randomToken } from "@/lib/crypto";
import { requireUser } from "@/lib/session";

// Meta bağlantısını başlatır: tek kullanımlık "state" üretir ve kullanıcıyı Meta onay ekranına gönderir.
export async function GET() {
  assertModule(await requireUser(), "meta");
  if (!metaApp()) redirect(`/reklam-hesaplari?hata=${encodeURIComponent("Meta bağlantısı henüz açık değil (META_APP_ID, META_APP_SECRET ve APP_URL tanımlı olmalı).")}`);
  const state = randomToken(32);
  (await cookies()).set("meta_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/meta" });
  redirect(metaAuthorizeUrl(state));
}
