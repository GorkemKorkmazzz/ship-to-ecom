"use server";

import { assertModule } from "@/lib/access";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { normalizeDomain } from "@/lib/website";

const BASE = "/siteler";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "hata" | "ok", msg: string): never => redirect(`${BASE}?${key}=${encodeURIComponent(msg)}`);

/** Formu doğrular. Mağaza yalnızca kullanıcının kendi mağazası olabilir. */
async function read(userId: string, fd: FormData) {
  const name = str(fd, "name").slice(0, 80);
  const domain = normalizeDomain(str(fd, "domain"));
  const storeId = str(fd, "storeId") || null;
  if (!name) go("hata", "Site adı zorunlu.");
  if (!domain) go("hata", "Geçerli bir alan adı girin (ör. magazam.com).");
  if (storeId && !(await db.store.findFirst({ where: { id: storeId, userId }, select: { id: true } }))) go("hata", "Mağaza bulunamadı.");
  return { name, domain: domain!, storeId };
}

/** Tekil anahtar ihlallerini anlaşılır mesaja çevirir (aynı alan adı ya da mağaza başka sitede). */
function uniqueError(e: unknown): string | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  const target = String((e.meta as { target?: unknown })?.target ?? "");
  return target.includes("storeId") ? "Bu mağaza zaten başka bir siteye bağlı." : "Bu alan adı zaten ekli.";
}

export async function createWebsite(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "siteler");
  const data = await read(user.id, fd);
  try {
    await db.website.create({ data: { ...data, userId: user.id } });
  } catch (e) {
    go("hata", uniqueError(e) ?? "Site eklenemedi.");
  }
  revalidatePath(BASE);
  go("ok", `${data.name} eklendi.`);
}

export async function updateWebsite(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "siteler");
  const site = await db.website.findFirst({ where: { id: str(fd, "id"), userId: user.id }, select: { id: true } });
  if (!site) go("hata", "Site bulunamadı.");
  const data = await read(user.id, fd);
  try {
    await db.website.update({ where: { id: site!.id }, data });
  } catch (e) {
    go("hata", uniqueError(e) ?? "Site güncellenemedi.");
  }
  revalidatePath(BASE);
  go("ok", `${data.name} güncellendi.`);
}

/** Siteyi siler. Reklam hesabı ilişkileri kalkar; reklam hesapları ve mağaza silinmez. */
export async function deleteWebsite(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "siteler");
  const r = await db.website.deleteMany({ where: { id: str(fd, "id"), userId: user.id } });
  revalidatePath(BASE);
  go(r.count ? "ok" : "hata", r.count ? "Site silindi." : "Site bulunamadı.");
}
