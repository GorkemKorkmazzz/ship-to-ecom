"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertModule } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { type Settings, parseSettings, sanitize, sfModule } from "@/lib/storefront/modules";
import { TIER_MODULE, syncTierCampaigns } from "@/lib/storefront/tiers";
import { WHEEL_MODULE, syncWheelCampaigns } from "@/lib/storefront/wheel";
import { syncDiscountCampaigns } from "@/lib/storefront/campaigns";
import { inScope, metas, refreshProductMeta } from "@/lib/storefront/catalog";

/** ikas kampanyası tutan indirim modülleri ve eşitleme seçenekleri. */
const DISCOUNT_MODULES: Record<string, { listKey: string; applyToProductPrice: boolean; requireEnd?: boolean }> = {
  "flash-urunler": { listKey: "campaigns", applyToProductPrice: true, requireEnd: true },
  "fiyat-alti-indirim": { listKey: "campaigns", applyToProductPrice: false },
};
/** Ürün bilgisi (slug, kategori, eklenme tarihi) kullanan modüller: yayında ikas'tan yenilenir. */
const META_MODULES = new Set(["flash-urunler", "fiyat-alti-indirim", "urun-etiketleri"]);

/** ikas tarafında karşılığı olan modüller (şimdilik Çok Al Az Öde): yayın ve aç/kapat ikas'a yansıtılır. */
async function syncRemote(storeId: string, moduleKey: string, prev: Settings | null, next: Settings, enabled: boolean) {
  if (moduleKey !== TIER_MODULE && moduleKey !== WHEEL_MODULE && !DISCOUNT_MODULES[moduleKey] && !META_MODULES.has(moduleKey)) return { settings: next, error: null };
  const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
  if (META_MODULES.has(moduleKey) && enabled) {
    try {
      await refreshProductMeta(store);
    } catch (e) {
      return { settings: next, error: `ikas ürün bilgisi alınamadı: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  if (moduleKey === "fiyat-alti-indirim" && enabled) {
    // Kategori kampanyaları vitrinde ürün kimliğiyle eşleşir: ikas Admin API'deki ürün-kategori ilişkisinden çözülür.
    const all = await metas(store.id);
    next = { ...next, campaigns: ((next.campaigns as Record<string, string | number | boolean>[]) ?? []).map((c) => ({ ...c, catProducts: c.scope === "categories" ? [...inScope(all, "categories", "", c.categoryIds)].join(",") : "" })) };
  }
  if (DISCOUNT_MODULES[moduleKey]) return syncDiscountCampaigns(store, prev, next, enabled, DISCOUNT_MODULES[moduleKey]);
  if (META_MODULES.has(moduleKey)) return { settings: next, error: null };
  // Çark: kampanyalar pasifte silinmez (verilmiş kuponlar geçerli kalsın); yalnızca açarken/yayınlarken eşitlenir.
  if (moduleKey === WHEEL_MODULE) return enabled ? syncWheelCampaigns(store, next) : { settings: next, error: null };
  return syncTierCampaigns(store, prev, next, enabled);
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, key: "ok" | "hata", msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);

/** Kullanıcının kendi mağazası ve geçerli modül; değilse hata ile döner. */
async function ctx(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "vitrin");
  const store = await db.store.findFirst({ where: { id: str(fd, "storeId"), userId: user.id }, select: { id: true } });
  if (!store) go("/vitrin", "hata", "Mağaza bulunamadı.");
  const key = str(fd, "moduleKey");
  const mod = key ? sfModule(key) : undefined;
  return { storeId: store!.id, mod };
}
const where = (storeId: string, moduleKey: string) => ({ storeId_moduleKey: { storeId, moduleKey } });

/** Mağazanın vitrin anahtarını oluşturur ya da yeniler (yenilemede eski kurulum satırı çalışmaz). */
export async function rotateKey(fd: FormData) {
  const { storeId } = await ctx(fd);
  await db.store.update({ where: { id: storeId }, data: { sfKey: randomToken(16) } });
  revalidatePath("/vitrin");
  go(`/vitrin?magaza=${storeId}`, "ok", "Vitrin anahtarı oluşturuldu. Kurulum satırını temaya ekleyin.");
}

export async function toggleModule(fd: FormData) {
  const { storeId, mod } = await ctx(fd);
  if (!mod) go(`/vitrin?magaza=${storeId}`, "hata", "Modül bulunamadı.");
  const enabled = str(fd, "enabled") === "1";
  // Yalnızca vitrin sayfalarına geri dönülür (açık yönlendirme olmasın).
  const back = str(fd, "back") === "modul" ? `/vitrin/${mod!.key}?magaza=${storeId}` : `/vitrin?magaza=${storeId}`;
  const row = await db.storeModule.findUnique({ where: where(storeId, mod!.key) });
  const published = row?.publishedAt ? parseSettings(mod!, row.settings) : null;
  const sync = published ? await syncRemote(storeId, mod!.key, published, published, enabled) : { settings: null, error: null };
  // ikas'a yansıtılamadıysa açma işlemi yapılmaz (indirim mağazada uygulanmıyorken vitrinde gösterilmesin).
  const finalEnabled = sync.error && enabled ? false : enabled;
  const settings = sync.settings ? { settings: JSON.stringify(sync.settings) } : {};
  await db.storeModule.upsert({ where: where(storeId, mod!.key), create: { storeId, moduleKey: mod!.key, enabled: finalEnabled, ...settings }, update: { enabled: finalEnabled, ...settings } });
  revalidatePath("/vitrin", "layout");
  if (sync.error) go(back, "hata", `Değişiklik uygulanamadı: ${sync.error}${enabled ? " Modül pasif kaldı." : ""}`);
  go(back, "ok", `${mod!.name} ${enabled ? "açıldı; mağazada en geç 1 dakika içinde görünür" : "kapatıldı; mağazadan en geç 1 dakika içinde kalkar"}.`);
}

/** Taslak kaydı, yayınlama ve taslağı silme tek formdan (_op) gelir. */
export async function saveModule(fd: FormData) {
  const { storeId, mod } = await ctx(fd);
  if (!mod) go(`/vitrin?magaza=${storeId}`, "hata", "Modül bulunamadı.");
  const back = `/vitrin/${mod!.key}?magaza=${storeId}`;
  const op = str(fd, "_op");
  if (op === "sifirla") {
    await db.storeModule.updateMany({ where: { storeId, moduleKey: mod!.key }, data: { draft: null } });
    revalidatePath(back);
    go(back, "ok", "Taslak silindi; yayındaki ayarlar geçerli.");
  }
  const raw = Object.fromEntries(mod!.fields.map((f) => [f.key, f.type === "ids" ? fd.getAll(f.key).join(",") : (fd.get(f.key) ?? (f.type === "boolean" ? "" : undefined))]));
  let json = JSON.stringify(sanitize(mod!, raw));
  if (op === "yayinla") {
    const row = await db.storeModule.findUnique({ where: where(storeId, mod!.key) });
    const sync = await syncRemote(storeId, mod!.key, row?.publishedAt ? parseSettings(mod!, row.settings) : null, sanitize(mod!, raw), row?.enabled ?? false);
    json = JSON.stringify(sync.settings);
    if (sync.error) {
      // Yayınlanmaz; yalnızca ikas kimlikleri güncel kalsın diye taslak olarak saklanır.
      await db.storeModule.upsert({ where: where(storeId, mod!.key), create: { storeId, moduleKey: mod!.key, draft: json }, update: { draft: json } });
      go(back, "hata", `Yayınlanamadı: ${sync.error}`);
    }
    await db.storeModule.upsert({
      where: where(storeId, mod!.key),
      create: { storeId, moduleKey: mod!.key, settings: json, version: 1, publishedAt: new Date() },
      update: { settings: json, draft: null, version: { increment: 1 }, publishedAt: new Date() },
    });
    revalidatePath("/vitrin");
    go(back, "ok", "Yayınlandı. Mağazada en geç 1 dakika içinde görünür.");
  }
  await db.storeModule.upsert({ where: where(storeId, mod!.key), create: { storeId, moduleKey: mod!.key, draft: json }, update: { draft: json } });
  revalidatePath(back);
  go(back, "ok", "Taslak kaydedildi. Önizlemede görebilirsiniz; mağazada henüz değişmedi.");
}
