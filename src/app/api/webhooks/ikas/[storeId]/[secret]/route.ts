import { after } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { syncUser } from "@/lib/sync";

// ikas webhook'u yalnızca "bir şey değişti" sinyali olarak kullanılır: gövdesi okunmaz
// ve saklanmaz (içinde müşteri verisi olabilir). Gerçek veri API'den yeniden çekilir.
// Kimlik doğrulama, URL'deki mağazaya özel gizli anahtarla yapılır.
export async function POST(_req: Request, ctx: { params: Promise<{ storeId: string; secret: string }> }) {
  const { storeId, secret } = await ctx.params;
  const store = await db.store.findUnique({ where: { id: storeId } });
  if (!store || !safeEqual(store.webhookSecret, secret)) return new Response("not found", { status: 404 });
  after(() => syncUser(store.userId).catch((e) => console.error("webhook sync", e)));
  return new Response("ok");
}
