// Mobil uygulama için oturum: çerez yerine "Authorization: Bearer <token>" kullanılır.
// Token, web oturumundan ayrıdır (typ: "mobile") ve web çerezi olarak kabul edilmez.
import type { User } from "@prisma/client";
import { SignJWT, jwtVerify } from "jose";
import { secretKeyBytes } from "./crypto";
import { db } from "./db";

const MAX_AGE = 60 * 60 * 24 * 30;

export async function createMobileToken(userId: string) {
  return new SignJWT({ uid: userId, typ: "mobile" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKeyBytes());
}

export const apiError = (status: number, message: string) => Response.json({ hata: message }, { status });

/** İstekteki token'dan kullanıcıyı bulur; yoksa, geçersizse ya da hesap askıdaysa null. */
export async function mobileUser(req: Request): Promise<User | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secretKeyBytes());
    if (payload.typ !== "mobile" || typeof payload.uid !== "string") return null;
    const user = await db.user.findUnique({ where: { id: payload.uid } });
    return user && !user.suspended ? user : null;
  } catch {
    return null;
  }
}

/** Oturum gerektiren uçlar için sarmalayıcı: oturum yoksa 401, beklenmeyen hata olursa 500 döner. */
export function withUser(handler: (user: User, req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const user = await mobileUser(req);
    if (!user) return apiError(401, "Oturum geçersiz ya da süresi dolmuş. Yeniden giriş yapın.");
    try {
      return await handler(user, req);
    } catch (e) {
      console.error("mobil api", new URL(req.url).pathname, e);
      return apiError(500, "Beklenmeyen bir hata oluştu.");
    }
  };
}

// Giriş denemesi sınırı (bellekte; tek sunucu örneği varsayar): 15 dakikada 8 başarısız deneme.
const fails = new Map<string, { n: number; until: number }>();
export function loginBlocked(key: string) {
  const f = fails.get(key);
  if (f && f.until < Date.now()) fails.delete(key);
  return (fails.get(key)?.n ?? 0) >= 8;
}
export function loginFailed(key: string) {
  const f = fails.get(key);
  fails.set(key, { n: (f?.n ?? 0) + 1, until: Date.now() + 15 * 60_000 });
}
export const loginOk = (key: string) => void fails.delete(key);
