"use server";

import { assertModule } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { adapterFor } from "@/lib/platforms";
import type { PriceWrite } from "@/lib/platforms/types";
import { applyRule } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

const BASE = "/urunler/tanimlamalar";
const KINDS = ["category", "brand", "field"] as const;
type Kind = (typeof KINDS)[number];
const KIND_LABEL: Record<Kind, string> = { category: "Kategori", brand: "Marka", field: "Özel alan" };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, key: "hata" | "ok", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg.slice(0, 600))}`);
const kindOf = (v: string): Kind | null => (KINDS as readonly string[]).includes(v) ? (v as Kind) : null;

export async function addDefinition(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "fiyat");
  const kind = kindOf(str(fd, "kind"));
  const name = str(fd, "name").replace(/\s+/g, " ").slice(0, 80);
  if (!kind) go(BASE, "hata", "Tanım türü geçersiz.");
  if (!name) go(BASE, "hata", "Ad boş olamaz.");
  const exists = await db.definition.findUnique({ where: { userId_kind_name: { userId: user.id, kind: kind!, name } } });
  if (exists) go(BASE, "hata", `${KIND_LABEL[kind!]} zaten tanımlı: ${name}`);
  await db.definition.create({ data: { userId: user.id, kind: kind!, name } });
  revalidatePath(BASE);
  go(BASE, "ok", `${KIND_LABEL[kind!]} eklendi: ${name}`);
}

/** Tanımı siler; ürünlere atanmışsa atamalar da kaldırılır (ürünlere ve mağazalara dokunulmaz). */
export async function removeDefinition(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "fiyat");
  const def = await db.definition.findFirst({ where: { id: str(fd, "id"), userId: user.id } });
  if (!def) go(BASE, "hata", "Tanım bulunamadı.");
  const { kind, name } = def!;
  if (kind === "category") await db.skuSetting.updateMany({ where: { userId: user.id, category: name }, data: { category: null } });
  if (kind === "brand") await db.skuSetting.updateMany({ where: { userId: user.id, brand: name }, data: { brand: null } });
  if (kind === "field") {
    for (const s of await db.skuSetting.findMany({ where: { userId: user.id, fields: { contains: JSON.stringify(name) } } })) {
      const f = parseFields(s.fields);
      delete f[name];
      await db.skuSetting.update({ where: { id: s.id }, data: { fields: JSON.stringify(f) } });
    }
  }
  await db.definition.delete({ where: { id: def!.id } });
  revalidatePath(BASE);
  go(BASE, "ok", `${KIND_LABEL[kind as Kind] ?? "Tanım"} silindi: ${name}`);
}

function parseFields(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Bir SKU'ya kategori, marka ve özel alan değerlerini atar. Yalnızca panelde saklanır; mağazalara yazılmaz. */
export async function saveSkuMeta(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "fiyat");
  const sku = str(fd, "sku");
  const path = `/urunler/duzenle?sku=${encodeURIComponent(sku)}`;
  if (!sku) go("/urunler", "hata", "SKU eksik.");
  const defs = await db.definition.findMany({ where: { userId: user.id } });
  const pick = (kind: Kind, value: string) => (value && defs.some((d) => d.kind === kind && d.name === value) ? value : null);
  const fields: Record<string, string> = {};
  for (const d of defs.filter((x) => x.kind === "field")) {
    const v = str(fd, `field_${d.id}`).slice(0, 200);
    if (v) fields[d.name] = v;
  }
  const data = { category: pick("category", str(fd, "category")), brand: pick("brand", str(fd, "brand")), fields: JSON.stringify(fields) };
  await db.skuSetting.upsert({ where: { userId_sku: { userId: user.id, sku } }, create: { userId: user.id, sku, ...data }, update: data });
  revalidatePath("/", "layout");
  go(path, "ok", "Tanımlar kaydedildi.");
}

/**
 * Bir kategorideki (ya da markadaki) tüm ürünlerin fiyatını yüzdeyle değiştirir ve seçili mağazalara yazar.
 * Otomatik fiyat kuralıyla yönetilen mağaza atlanır (fiyatı zaten diğer mağazadan hesaplanır).
 */
export async function changePricesByDefinition(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "fiyat");
  const group = str(fd, "group");
  const cut = group.indexOf("|");
  const kind = kindOf(group.slice(0, Math.max(cut, 0)));
  const name = cut >= 0 ? group.slice(cut + 1) : "";
  const percent = Number(str(fd, "percent").replace(",", "."));
  const round = ["none", "1", "0.90", "0.99"].includes(str(fd, "round")) ? str(fd, "round") : "none";
  const storeIds = fd.getAll("storeIds").map(String);
  if (kind !== "category" && kind !== "brand") go(BASE, "hata", "Kategori ya da marka seçin.");
  if (!name) go(BASE, "hata", "Kategori ya da marka seçin.");
  if (!Number.isFinite(percent) || percent === 0) go(BASE, "hata", "Yüzde 0'dan farklı bir sayı olmalı (ör. 10 ya da -5).");
  if (percent <= -90 || percent > 500) go(BASE, "hata", "Yüzde -90 ile 500 arasında olmalı.");
  if (fd.get("confirm") !== "on") go(BASE, "hata", "Fiyatlar mağazalara yazılacağı için onay kutusunu işaretleyin.");

  const stores = (await db.store.findMany({ where: { userId: user.id, id: { in: storeIds } }, orderBy: { createdAt: "asc" } }));
  if (!stores.length) go(BASE, "hata", "En az bir mağaza seçin.");
  const skus = (await db.skuSetting.findMany({ where: { userId: user.id, [kind as "category" | "brand"]: name }, select: { sku: true } })).map((s) => s.sku);
  if (!skus.length) go(BASE, "hata", `"${name}" tanımına atanmış ürün yok. Ürün düzenleme sayfasından atayın.`);

  const rule = { percent, fixed: 0, round };
  const notes: string[] = [];
  let changed = 0;
  for (const store of stores) {
    if (store.priceRuleActive) {
      notes.push(`${store.label}: otomatik fiyat kuralıyla yönetildiği için atlandı`);
      continue;
    }
    const rows = await db.storeVariant.findMany({ where: { storeId: store.id, matchSku: { in: skus }, sellPrice: { not: null } } });
    const writes: (PriceWrite & { rowId: string })[] = rows.map((r) => {
      const sellPrice = applyRule(r.sellPrice!, rule);
      let discountPrice = r.discountPrice === null ? null : applyRule(r.discountPrice, rule);
      if (discountPrice !== null && discountPrice >= sellPrice) discountPrice = null;
      return { rowId: r.id, productId: r.productId, variantId: r.variantId, sellPrice, discountPrice, buyPrice: r.buyPrice };
    });
    if (!writes.length) continue;
    try {
      await adapterFor(store).setPrices(store, writes);
      const ops = writes.map((w) => db.storeVariant.update({ where: { id: w.rowId }, data: { sellPrice: w.sellPrice, discountPrice: w.discountPrice } }));
      for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
      changed += writes.length;
    } catch (e) {
      notes.push(`${store.label}: fiyatlar yazılamadı (${e instanceof Error ? e.message : e})`);
    }
  }
  const sign = percent > 0 ? "+" : "";
  const summary = `${name}: ${changed} fiyat %${sign}${percent} değiştirildi.`;
  await db.syncLog.create({ data: { userId: user.id, level: notes.length ? "warn" : "info", message: `Toplu fiyat (${KIND_LABEL[kind as Kind].toLocaleLowerCase("tr")}) — ${summary}${notes.length ? ` ${notes.join(" · ")}` : ""}`.slice(0, 1900) } });
  if (changed) await syncUser(user.id).catch(() => {}); // fiyat kuralı varsa hedef mağazaya yansısın
  revalidatePath("/", "layout");
  go(BASE, notes.length ? "hata" : "ok", `${summary}${notes.length ? ` ${notes.join(" · ")}` : ""}`);
}
