import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { secretKeyBytes } from "./crypto";
import { db } from "./db";

const COOKIE = "ikiz_session";
const MAX_AGE = 60 * 60 * 24 * 14;

export async function createSession(userId: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKeyBytes());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getUserId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKeyBytes());
    return typeof payload.uid === "string" ? payload.uid : null;
  } catch {
    return null;
  }
}

// Aynı istekte layout ve sayfa kullanıcıyı bir kez okur (istekler arası saklanmaz).
const loadUser = cache((id: string) => db.user.findUnique({ where: { id } }));

/** Oturum yoksa girişe yönlendirir. */
export async function requireUser() {
  const id = await getUserId();
  const user = id ? await loadUser(id) : null;
  if (!user || user.suspended) redirect("/giris");
  return user;
}

/** Oturumdaki kullanıcı gerçekten var mı? (Silinmiş hesabın çerezi yönlendirme döngüsü yaratmasın.) */
export async function hasValidSession(): Promise<boolean> {
  const id = await getUserId();
  return !!id && (await db.user.count({ where: { id } })) > 0;
}

// ───────────── Yönetim paneli oturumu (ayrı çerez, ayrı hesap tablosu) ─────────────
const ADMIN_COOKIE = "ste_admin";
const ADMIN_MAX_AGE = 60 * 60 * 12;

export async function createAdminSession(adminId: string) {
  const token = await new SignJWT({ aid: adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_MAX_AGE}s`)
    .sign(secretKeyBytes());
  (await cookies()).set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_MAX_AGE,
    path: "/backoffice",
  });
}

export async function destroyAdminSession() {
  (await cookies()).set(ADMIN_COOKIE, "", { path: "/backoffice", maxAge: 0 });
}

export async function getAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKeyBytes());
    return typeof payload.aid === "string" ? await db.admin.findUnique({ where: { id: payload.aid } }) : null;
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/backoffice/giris");
  return admin;
}
