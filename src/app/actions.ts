"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { encrypt, randomToken } from "@/lib/crypto";
import { invalidateUser } from "@/lib/cache";
import { db } from "@/lib/db";
import { TRIAL_DAYS, hasBiggerPlan, planById, storeLimitOf } from "@/lib/plans";
import { fetchToken, normalizeStoreName, registerWebhooks } from "@/lib/ikas";
import { createSession, destroySession, requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (path: string, key: "hata" | "ok", msg: string): never =>
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);

export async function register(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back("/kayit", "hata", "Geçerli bir e-posta girin.");
  if (password.length < 8) back("/kayit", "hata", "Şifre en az 8 karakter olmalı.");
  if (await db.user.findUnique({ where: { email } })) back("/kayit", "hata", "Bu e-posta zaten kayıtlı.");
  const plan = planById(str(fd, "paket"))?.id ?? "baslangic";
  const user = await db.user.create({
    data: {
      email, passwordHash: await bcrypt.hash(password, 10),
      plan, billingPeriod: str(fd, "donem") === "yillik" ? "yillik" : "aylik",
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 3600_000),
    },
  });
  await createSession(user.id);
  redirect("/magazalar");
}

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(String(fd.get("password") ?? ""), user.passwordHash));
  if (!user || !ok) back("/giris", "hata", "E-posta veya şifre hatalı.");
  if (user!.suspended) back("/giris", "hata", "Hesabınız askıya alınmış. Destek ile iletişime geçin.");
  await createSession(user!.id);
  redirect("/panel");
}

export async function logout() {
  await destroySession();
  redirect("/giris");
}

export async function addStore(fd: FormData) {
  const user = await requireUser();
  const label = str(fd, "label");
  const storeName = normalizeStoreName(str(fd, "storeName"));
  const clientId = str(fd, "clientId");
  const clientSecret = str(fd, "clientSecret");
  if (!label || !storeName || !clientId || !clientSecret) back("/magazalar", "hata", "Tüm alanları doldurun.");
  if (!/^[a-z0-9-]+$/.test(storeName)) back("/magazalar", "hata", "Mağaza adı geçersiz (örnek: magazam).");
  // Mağaza hakkı pakete göre; sayfadaki form gizlense de sınır burada uygulanır.
  const limit = storeLimitOf(user.plan);
  if ((await db.store.count({ where: { userId: user.id } })) >= limit)
    back("/magazalar", "hata", hasBiggerPlan(user.plan)
      ? `${planById(user.plan)?.name ?? "Mevcut"} paketinde en fazla ${limit} mağaza bağlanabilir. Daha fazla mağaza için lütfen paketinizi değiştirin.`
      : `Paketinizin mağaza hakkı (${limit}) doldu. Daha fazla mağaza için destek ile iletişime geçin.`);
  if (await db.store.findUnique({ where: { userId_storeName: { userId: user.id, storeName } } }))
    back("/magazalar", "hata", "Bu mağaza zaten bağlı.");

  let token;
  try {
    token = await fetchToken(storeName, clientId, clientSecret);
  } catch (e) {
    back("/magazalar", "hata", e instanceof Error ? e.message : "ikas bağlantısı kurulamadı.");
  }
  await db.store.create({
    data: {
      userId: user.id,
      label,
      storeName,
      clientId,
      clientSecretEnc: encrypt(clientSecret),
      accessToken: token!.accessToken,
      tokenExpiresAt: new Date(Date.now() + token!.expiresIn * 1000),
      webhookSecret: randomToken(),
    },
  });
  back("/magazalar", "ok", "Mağaza bağlandı. Stokların eşitlenmesi için “Şimdi senkronize et”e basın.");
}

export async function deleteStore(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  // Mağaza ayrılınca ortak stok bağları sıfırlanır; yeniden bağlanınca baştan kurulur.
  await db.$transaction([
    db.store.deleteMany({ where: { id, userId: user.id } }),
    db.sharedItem.deleteMany({ where: { userId: user.id } }),
    db.storeVariant.updateMany({ where: { store: { userId: user.id } }, data: { lastSeenStock: null } }),
  ]);
  invalidateUser(user.id);
  back("/magazalar", "ok", "Mağaza kaldırıldı.");
}

export async function setupWebhooks(fd: FormData) {
  const user = await requireUser();
  const store = await db.store.findFirst({ where: { id: str(fd, "id"), userId: user.id } });
  if (!store) back("/magazalar", "hata", "Mağaza bulunamadı.");
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://")) back("/magazalar", "hata", "Webhook için APP_URL https adresi olmalı (yayına alınca çalışır).");
  try {
    await registerWebhooks(store!, `${base}/api/webhooks/ikas/${store!.id}/${store!.webhookSecret}`);
  } catch (e) {
    back("/magazalar", "hata", e instanceof Error ? e.message : "Webhook kurulamadı.");
  }
  await db.store.update({ where: { id: store!.id }, data: { webhooksActive: true } });
  back("/magazalar", "ok", "Webhook'lar kuruldu; sipariş ve stok değişiklikleri anında işlenecek.");
}

export async function syncNow(fd: FormData) {
  const user = await requireUser();
  const path = str(fd, "path") || "/panel";
  try {
    await syncUser(user.id);
  } catch (e) {
    back(path, "hata", e instanceof Error ? e.message : "Senkron başarısız.");
  }
  revalidatePath("/", "layout");
  back(path, "ok", "Senkron tamamlandı.");
}

// ───────────── Otomatik fiyat kuralı ─────────────
export async function savePriceRule(fd: FormData) {
  const user = await requireUser();
  const targetId = str(fd, "storeId");
  const n = (k: string) => Number(str(fd, k).replace(",", ".")) || 0;
  const percent = n("percent");
  const round = ["none", "1", "0.90", "0.99"].includes(str(fd, "round")) ? str(fd, "round") : "none";
  if (percent <= -100) back("/urunler", "hata", "Yüzde -100'den büyük olmalı.");
  const stores = await db.store.findMany({ where: { userId: user.id } });
  if (targetId && !stores.some((s) => s.id === targetId)) back("/urunler", "hata", "Mağaza bulunamadı.");
  if (targetId && stores.length < 2) back("/urunler", "hata", "Fiyat kuralı için iki mağaza bağlı olmalı.");
  await db.$transaction([
    db.store.updateMany({ where: { userId: user.id }, data: { priceRuleActive: false } }),
    ...(targetId
      ? [db.store.update({ where: { id: targetId }, data: { priceRuleActive: true, pricePercent: percent, priceFixed: n("fixed"), priceRound: round } })]
      : []),
  ]);
  if (!targetId) back("/urunler", "ok", "Otomatik fiyat kuralı kapatıldı. Mevcut fiyatlara dokunulmadı.");
  try {
    await syncUser(user.id);
  } catch (e) {
    back("/urunler", "hata", e instanceof Error ? e.message : "Senkron başarısız.");
  }
  revalidatePath("/", "layout");
  back("/urunler", "ok", "Fiyat kuralı kaydedildi ve uygulandı.");
}

// ───────────── Stok ayarları ─────────────
const optNum = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(",", ".");
  const n = Number(v);
  return v === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

async function syncThen(userId: string, path: string, okMsg: string): Promise<never> {
  try {
    await syncUser(userId);
  } catch (e) {
    back(path, "hata", e instanceof Error ? e.message : "Senkron başarısız.");
  }
  revalidatePath("/", "layout");
  return back(path, "ok", okMsg);
}

export async function saveStockSettings(fd: FormData) {
  const user = await requireUser();
  const stores = await db.store.findMany({ where: { userId: user.id } });
  const shares = stores.map((s) => ({ id: s.id, pct: optNum(fd, `share_${s.id}`) ?? 100 }));
  if (shares.some((s) => s.pct > 100)) back("/stok", "hata", "Mağaza payı %100'ü geçemez.");
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { safetyStock: optNum(fd, "safetyStock") ?? 0, lowStockThreshold: optNum(fd, "lowStockThreshold") } }),
    ...shares.map((s) => db.store.update({ where: { id: s.id }, data: { stockSharePercent: s.pct } })),
  ]);
  await syncThen(user.id, "/stok", "Stok ayarları kaydedildi ve mağazalara uygulandı.");
}

const detailPath = (sku: string) => `/stok/detay?sku=${encodeURIComponent(sku)}`;
// back() sorgu ekler; detay yolunda zaten "?" olduğu için ayrı yardımcı.
const backDetail = (sku: string, key: "hata" | "ok", msg: string): never =>
  redirect(`${detailPath(sku)}&${key}=${encodeURIComponent(msg)}`);

export async function saveSkuSettings(fd: FormData) {
  const user = await requireUser();
  const sku = str(fd, "sku");
  if (!sku) back("/stok", "hata", "SKU eksik.");
  const data = { excluded: fd.get("excluded") === "on", safetyStock: optNum(fd, "safetyStock"), lowStockThreshold: optNum(fd, "lowStockThreshold") };
  await db.skuSetting.upsert({ where: { userId_sku: { userId: user.id, sku } }, create: { userId: user.id, sku, ...data }, update: data });
  try {
    await syncUser(user.id);
  } catch (e) {
    backDetail(sku, "hata", e instanceof Error ? e.message : "Senkron başarısız.");
  }
  revalidatePath("/", "layout");
  backDetail(sku, "ok", "SKU ayarları kaydedildi.");
}

export async function adjustStock(fd: FormData) {
  const user = await requireUser();
  const sku = str(fd, "sku");
  const target = optNum(fd, "stock");
  if (target === null) backDetail(sku, "hata", "Geçerli bir stok adedi girin.");
  const item = await db.sharedItem.findUnique({ where: { userId_sku: { userId: user.id, sku } } });
  if (!item) backDetail(sku, "hata", "Bu SKU ortak stoğa bağlı değil; stok ikas panelinden değiştirilmeli.");
  // Düzeltme, yarış olmaması için bir sonraki senkron turunda (kilit altında) uygulanır.
  await db.sharedItem.update({
    where: { id: item!.id },
    data: { pendingDelta: target! - item!.sharedStock, pendingNote: str(fd, "note").slice(0, 200) || null },
  });
  try {
    await syncUser(user.id);
  } catch (e) {
    backDetail(sku, "hata", e instanceof Error ? e.message : "Senkron başarısız.");
  }
  revalidatePath("/", "layout");
  backDetail(sku, "ok", "Stok güncellendi ve mağazalara yazıldı.");
}
