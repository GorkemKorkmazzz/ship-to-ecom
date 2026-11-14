// Hediye Çarkı sunucu tarafı: ödül kampanyaları (ikas), çevirme (olasılık, tekrar kontrolü, kişiye özel kupon) ve istatistik.
// ikas şeması introspection ile doğrulandı: saveCampaign (hasCoupon), campaignAddCoupons { coupons: [{ code, usageLimit, usageLimitPerCustomer, canCombineWithOtherCampaigns }] },
// listCoupon(campaignId: { eq }) → usageCount.
import { createHmac, randomBytes, randomInt } from "crypto";
import type { Store } from "@prisma/client";
import { db } from "../db";
import { encrypt, secretKeyBytes } from "../crypto";
import { addCoupon, listCouponUsage, saveCampaign } from "../ikas";
import { type Scalar, type Settings, inSchedule, parseSettings, sfModule } from "./modules";

export const WHEEL_MODULE = "hediye-carki";
type Prize = Record<string, Scalar>;
const COUPON_TYPES = ["RATIO", "FIXED_AMOUNT", "FREE_SHIPPING"];
const prizesOf = (s: Settings | null) => ((s?.prizes as Prize[] | undefined) ?? []);

/** Yayından önce kontrol. Olasılıklar yüzde cinsinden, iki ondalığa kadar; toplam tam 100 olmalı. */
export function validateWheel(s: Settings): string | null {
  const ps = prizesOf(s);
  if (ps.length < 2) return "Çarkta en az 2 dilim olmalı.";
  let total = 0;
  for (const p of ps) {
    const name = String(p.label || "Dilim");
    const c = Number(p.chance);
    if (!Number.isFinite(c) || c < 0) return `${name}: olasılık girin.`;
    if (Math.round(c * 100) !== c * 100) return `${name}: olasılık en fazla iki ondalık olabilir.`;
    total += Math.round(c * 100);
    if (p.type === "RATIO" && !(Number(p.amount) > 0 && Number(p.amount) <= 100)) return `${name}: yüzde indirim 0 ile 100 arasında olmalı.`;
    if (p.type === "FIXED_AMOUNT" && !(Number(p.amount) > 0)) return `${name}: indirim tutarı girin.`;
    if (p.type === "CODE" && !String(p.code).trim()) return `${name}: hazır indirim kodunu girin.`;
  }
  if (total !== 10000) return `Olasılıkların toplamı %100 olmalı (şu an %${(total / 100).toLocaleString("tr")}).`;
  if (!/^[A-Z0-9]{0,8}$/.test(String(s.codePrefix))) return "Kupon ön eki yalnızca büyük harf ve rakam olabilir (en fazla 8).";
  return null;
}

/**
 * İndirimli dilimler için ikas'ta kuponlu kampanya oluşturur/günceller ve dilimlere kalıcı anahtar atar.
 * Kampanyalar silinmez: daha önce verilmiş kuponlar geçerli kalmalı.
 */
export async function syncWheelCampaigns(store: Store, next: Settings): Promise<{ settings: Settings; error: string | null }> {
  const bad = validateWheel(next);
  if (bad) return { settings: next, error: bad };
  const list: Prize[] = prizesOf(next).map((p) => ({ ...p, key: p.key || randomBytes(6).toString("hex") }));
  const days = Number(next.couponValidityDays);
  try {
    for (const p of list) {
      if (!COUPON_TYPES.includes(String(p.type))) continue;
      p.ikasId = await saveCampaign(store, {
        ...(p.ikasId ? { id: String(p.ikasId) } : {}),
        title: `Hediye Çarkı: ${String(p.label)}`,
        type: p.type,
        applicablePrice: "SELL_PRICE",
        hasCoupon: true,
        canCombineWithOtherCampaigns: next.combine === true,
        ...(p.type === "FREE_SHIPPING" ? { isFreeShipping: true } : { fixedDiscount: { amount: Number(p.amount) } }),
        ...(days > 0 ? { couponValidityPeriod: days } : {}),
      });
    }
  } catch (e) {
    return { settings: { ...next, prizes: list }, error: `ikas: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { settings: { ...next, prizes: list }, error: null };
}

/** Olasılığa göre seçim: kriptografik rastgele sayı, baz puan (1/10000) hassasiyetinde. */
export function pickPrize(ps: Prize[]): number {
  const r = randomInt(0, 10000);
  let acc = 0;
  for (let i = 0; i < ps.length; i++) {
    acc += Math.round(Number(ps[i].chance) * 100);
    if (r < acc) return i;
  }
  return ps.length - 1;
}

const hmac = (v: string) => createHmac("sha256", Buffer.from(secretKeyBytes())).update(v).digest("hex");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // karışan karakterler (0/O, 1/I) yok
const newCode = (prefix: string) => `${prefix ? prefix + "-" : ""}${Array.from({ length: 8 }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join("")}`;

export function normalizeContact(mode: string, raw: unknown): { kind: "email" | "phone"; value: string } | null {
  const v = String(raw ?? "").trim().slice(0, 120);
  // E-posta ASCII küçük harfe çevrilir (Türkçe kural "I" harfini "ı" yapıp aynı adresi farklı gösterirdi).
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v.toLowerCase() : null;
  const digits = v.replace(/[^\d]/g, "");
  const phone = /^(90)?0?5\d{9}$/.test(digits) ? "+90" + digits.slice(-10) : null;
  if ((mode === "email" || mode === "either") && email) return { kind: "email", value: email };
  if ((mode === "phone" || mode === "either") && phone) return { kind: "phone", value: phone };
  return null;
}

export type SpinResult =
  | { ok: true; index: number; key: string; label: string; type: string; code: string | null }
  | { ok: false; status: number; error: string; repeat?: boolean };

/** Bir çevirme. Ödül sunucuda seçilir; kupon ikas'a eklenemezse kazanım kaydedilmez (sahte kazanım yok). */
export async function spin(sfKey: string, body: { contact?: unknown; consent?: unknown; cookieId?: unknown }, ip: string): Promise<SpinResult> {
  const store = await db.store.findUnique({
    where: { sfKey },
    include: { user: { select: { plan: true, suspended: true, paidUntil: true, trialEndsAt: true } }, sfModules: { where: { moduleKey: WHEEL_MODULE } } },
  });
  const row = store?.sfModules[0];
  const mod = sfModule(WHEEL_MODULE)!;
  if (!store || !row?.enabled || !row.publishedAt) return { ok: false, status: 404, error: "Çark kapalı." };
  const { hasModule } = await import("../access");
  if (!hasModule(store.user, "vitrin") || store.user.suspended) return { ok: false, status: 404, error: "Çark kapalı." };
  const s = parseSettings(mod, row.settings);
  if (!inSchedule(s)) return { ok: false, status: 404, error: "Çark şu an aktif değil." };
  const ps = prizesOf(s);
  if (validateWheel(s)) return { ok: false, status: 503, error: "Çark yapılandırması eksik." };

  const cookieId = String(body.cookieId ?? "");
  if (!/^[a-f0-9]{32}$/.test(cookieId)) return { ok: false, status: 400, error: "Geçersiz istek." };
  const mode = String(s.contactMode);
  let contact: { kind: string; value: string } | null = null;
  if (mode !== "none") {
    contact = normalizeContact(mode, body.contact);
    if (!contact) return { ok: false, status: 400, error: mode === "phone" ? "Geçerli bir cep telefonu girin." : mode === "email" ? "Geçerli bir e-posta girin." : "Geçerli bir e-posta ya da telefon girin." };
    if (body.consent !== true) return { ok: false, status: 400, error: "Devam etmek için onay kutusunu işaretleyin." };
  }
  const contactHash = contact ? hmac(`${store.id}:${contact.value}`) : null;
  const ipHash = hmac(`${store.id}:ip:${ip}`);
  const since = new Date(Date.now() - Number(s.repeatDays) * 86_400_000);
  const or = [
    ...(s.byCookie ? [{ cookieId }] : []),
    ...(s.byIp ? [{ ipHash }] : []),
    ...(s.byContact && contactHash ? [{ contactHash }] : []),
  ];
  if (or.length && (await db.wheelEntry.findFirst({ where: { storeId: store.id, createdAt: { gte: since }, OR: or }, select: { id: true } })))
    return { ok: false, status: 409, error: String(s.repeatText), repeat: true };

  const index = pickPrize(ps);
  const p = ps[index];
  const type = String(p.type);
  let code: string | null = null;
  if (COUPON_TYPES.includes(type)) {
    if (!p.ikasId) return { ok: false, status: 503, error: "Ödül şu an verilemiyor." };
    // Benzersiz kod: yerel tekil indeks + ikas'a ekleme; çakışmada yeni kod denenir.
    for (let i = 0; i < 3 && !code; i++) {
      const c = newCode(String(s.codePrefix));
      if (await db.wheelEntry.findUnique({ where: { code: c }, select: { id: true } })) continue;
      try {
        await addCoupon(store, String(p.ikasId), c, s.combine === true, { usageLimit: Number(s.couponUsageLimit) || 1, usageLimitPerCustomer: 1 });
        code = c;
      } catch (e) {
        if (i === 2) {
          console.warn("çark kuponu eklenemedi", e instanceof Error ? e.message : e);
          return { ok: false, status: 503, error: "Ödül şu an verilemiyor, lütfen daha sonra deneyin." };
        }
      }
    }
    if (!code) return { ok: false, status: 503, error: "Ödül şu an verilemiyor." };
  } else if (type === "CODE") code = String(p.code);

  await db.wheelEntry.create({
    data: {
      storeId: store.id, contactHash, ipHash, cookieId,
      consent: !!contact,
      contactEnc: contact && s.storeContact ? encrypt(contact.value) : null,
      prizeKey: String(p.key), prizeLabel: String(p.label), prizeType: type,
      code: COUPON_TYPES.includes(type) ? code : null,
      campaignId: COUPON_TYPES.includes(type) ? String(p.ikasId) : null,
    },
  });
  return { ok: true, index, key: String(p.key), label: String(p.label), type, code };
}

/** Panel istatistikleri: çevirme ve kazanım sunucu kayıtlarından, kupon kullanımı ikas'tan (listCoupon.usageCount). */
export async function wheelStats(store: Store, s: Settings, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.wheelEntry.groupBy({ by: ["prizeKey", "prizeLabel", "prizeType"], where: { storeId: store.id, createdAt: { gte: since } }, _count: { _all: true } });
  const spins = rows.reduce((a, r) => a + r._count._all, 0);
  const wins = rows.filter((r) => r.prizeType !== "NONE").reduce((a, r) => a + r._count._all, 0);
  let used: number | null = null, usedError: string | null = null;
  try {
    const ids = [...new Set(prizesOf(s).map((p) => String(p.ikasId)).filter(Boolean))];
    const codes = new Set((await db.wheelEntry.findMany({ where: { storeId: store.id, code: { not: null } }, select: { code: true } })).map((x) => x.code));
    used = 0;
    for (const id of ids) for (const c of await listCouponUsage(store, id)) if (codes.has(c.code)) used += c.usageCount > 0 ? 1 : 0;
  } catch (e) {
    usedError = e instanceof Error ? e.message : String(e);
  }
  return { spins, wins, byPrize: rows.map((r) => ({ label: r.prizeLabel, type: r.prizeType, count: r._count._all })).sort((a, b) => b.count - a.count), used, usedError };
}
