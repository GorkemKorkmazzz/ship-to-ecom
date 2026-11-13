"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { csvNum, parseCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { adapterFor } from "@/lib/platforms";
import type { PriceWrite } from "@/lib/platforms/types";
import { copyProduct, createInStore, validateDraft } from "@/lib/product";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (path: string, key: "hata" | "ok", msg: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg.slice(0, 600))}`);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Bir mağazada olup diğerinde olmayan ürünü (tüm varyantlarıyla) karşı mağazada oluşturur. */
export async function copyToStore(fd: FormData) {
  const user = await requireUser();
  const stores = await db.store.findMany({ where: { userId: user.id } });
  const source = stores.find((s) => s.id === str(fd, "from"));
  const target = stores.find((s) => s.id === str(fd, "to"));
  if (!source || !target || source.id === target.id) go("/urunler", "hata", "Mağaza seçimi geçersiz.");
  const row = await db.storeVariant.findFirst({ where: { storeId: source!.id, matchSku: str(fd, "sku") } });
  if (!row) go("/urunler", "hata", "Ürün kaynak mağazada bulunamadı.");
  const siblings = await db.storeVariant.findMany({ where: { storeId: source!.id, productId: row!.productId } });
  const clash = await db.storeVariant.findFirst({
    where: { storeId: target!.id, OR: [{ sku: { in: siblings.map((s) => s.sku) } }, { matchSku: { in: siblings.map((s) => s.matchSku) } }] },
  });
  if (clash) go("/urunler", "hata", `"${clash.sku}" SKU'su ${target!.label} mağazasında zaten var.`);

  let warnings: string[] = [];
  try {
    warnings = await copyProduct(source!, target!, row!.productId);
  } catch (e) {
    go("/urunler", "hata", `Kopyalanamadı: ${errMsg(e)}`);
  }
  await syncUser(user.id).catch(() => {});
  await db.syncLog.create({
    data: { userId: user.id, level: warnings.length ? "warn" : "info", sku: row!.sku, storeLabel: target!.label, message: `Ürün kopyalandı: ${row!.productName} (${source!.label} → ${target!.label})${warnings.length ? ` · ${warnings.join(" · ")}` : ""}` },
  });
  revalidatePath("/", "layout");
  go("/urunler", warnings.length ? "hata" : "ok", warnings.length ? `Ürün kopyalandı, ancak: ${warnings.join(" · ")}` : `${row!.productName} → ${target!.label} mağazasına kopyalandı.`);
}

/** Bir SKU'nun mağaza bazında fiyatlarını günceller. */
export async function savePrices(fd: FormData) {
  const user = await requireUser();
  const sku = str(fd, "sku");
  const path = `/urunler/duzenle?sku=${encodeURIComponent(sku)}`;
  const stores = await db.store.findMany({ where: { userId: user.id } });
  const rows = await db.storeVariant.findMany({ where: { matchSku: sku, storeId: { in: stores.map((s) => s.id) } } });
  const errors: string[] = [];
  let changed = 0;
  for (const row of rows) {
    const store = stores.find((s) => s.id === row.storeId)!;
    if (store.priceRuleActive) continue; // otomatik kuralla yönetiliyor
    const sellPrice = csvNum(str(fd, `sell_${row.id}`));
    const discountPrice = csvNum(str(fd, `disc_${row.id}`));
    const buyPrice = csvNum(str(fd, `buy_${row.id}`));
    if (sellPrice === null || sellPrice < 0) { errors.push(`${store.label}: satış fiyatı geçersiz`); continue; }
    if (discountPrice !== null && discountPrice >= sellPrice) { errors.push(`${store.label}: indirimli fiyat satış fiyatından düşük olmalı`); continue; }
    if (sellPrice === row.sellPrice && discountPrice === row.discountPrice && buyPrice === row.buyPrice) continue;
    try {
      await adapterFor(store).setPrices(store, [{ productId: row.productId, variantId: row.variantId, sellPrice, discountPrice, buyPrice }]);
      await db.storeVariant.update({ where: { id: row.id }, data: { sellPrice, discountPrice, buyPrice } });
      changed++;
    } catch (e) {
      errors.push(`${store.label}: ${errMsg(e)}`);
    }
  }
  if (changed) {
    await db.syncLog.create({ data: { userId: user.id, level: "info", sku, message: `Fiyat panelden güncellendi (${changed} mağaza).` } });
    await syncUser(user.id).catch(() => {}); // fiyat kuralı varsa hedef mağazaya yansısın
    revalidatePath("/", "layout");
  }
  if (errors.length) go(path, "hata", errors.join(" · "));
  go(path, "ok", changed ? "Fiyatlar güncellendi." : "Değişiklik yok.");
}

const MAX_ROWS = 500;
async function readCsv(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) go("/urunler/toplu", "hata", "CSV dosyası seçin.");
  if ((file as File).size > 2 * 1024 * 1024) go("/urunler/toplu", "hata", "Dosya 2 MB'tan büyük olamaz.");
  const rows = parseCsv(await (file as File).text());
  if (!rows.length) go("/urunler/toplu", "hata", "Dosyada satır bulunamadı.");
  if (rows.length > MAX_ROWS) go("/urunler/toplu", "hata", `Tek seferde en fazla ${MAX_ROWS} satır yüklenebilir.`);
  if (!("sku" in rows[0])) go("/urunler/toplu", "hata", "Dosyada \"sku\" sütunu yok. Şablonu indirip kullanın.");
  return rows;
}

/** CSV ile toplu stok ve fiyat güncelleme. Boş hücreler değiştirilmez. */
export async function bulkUpdate(fd: FormData) {
  const user = await requireUser();
  const rows = await readCsv(fd);
  const stores = await db.store.findMany({ where: { userId: user.id } });
  const variants = await db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  const shared = new Map((await db.sharedItem.findMany({ where: { userId: user.id } })).map((s) => [s.sku, s]));
  const notes: string[] = [];
  const priceWrites = new Map<string, (PriceWrite & { rowId: string })[]>();
  let stockCount = 0, priceCount = 0;

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const sku = r.sku;
    const mine = variants.filter((v) => v.matchSku === sku || v.sku === sku);
    if (!sku || !mine.length) { notes.push(`Satır ${line}: SKU bulunamadı (${sku || "boş"})`); continue; }
    const key = mine[0].matchSku;

    const stock = csvNum(r.stok);
    if (stock !== null) {
      const item = shared.get(key);
      if (stock < 0) notes.push(`Satır ${line}: stok eksi olamaz`);
      else if (!item) notes.push(`Satır ${line}: ${sku} ortak stoğa bağlı değil, stok atlandı`);
      else {
        await db.sharedItem.update({ where: { id: item.id }, data: { pendingDelta: stock - item.sharedStock, pendingNote: "Toplu güncelleme (CSV)" } });
        stockCount++;
      }
    }

    const sell = csvNum(r.satis_fiyati), disc = csvNum(r.indirimli_fiyat), buy = csvNum(r.alis_fiyati);
    if (sell !== null || disc !== null || buy !== null || r.indirimli_fiyat === "-") {
      for (const v of mine) {
        const store = stores.find((s) => s.id === v.storeId)!;
        if (store.priceRuleActive) continue;
        const sellPrice = sell ?? v.sellPrice;
        if (sellPrice === null) { notes.push(`Satır ${line}: ${store.label} için satış fiyatı yok`); continue; }
        // "-" indirimli fiyatı kaldırır; boş hücre mevcut değeri korur.
        const discountPrice = r.indirimli_fiyat === "-" ? null : disc ?? v.discountPrice;
        if (discountPrice !== null && discountPrice >= sellPrice) { notes.push(`Satır ${line}: indirimli fiyat satış fiyatından düşük olmalı`); continue; }
        const list = priceWrites.get(store.id) ?? [];
        list.push({ rowId: v.id, productId: v.productId, variantId: v.variantId, sellPrice, discountPrice, buyPrice: buy ?? v.buyPrice });
        priceWrites.set(store.id, list);
      }
    }
  }

  for (const [storeId, list] of priceWrites) {
    const store = stores.find((s) => s.id === storeId)!;
    try {
      await adapterFor(store).setPrices(store, list);
      const ops = list.map((w) => db.storeVariant.update({ where: { id: w.rowId }, data: { sellPrice: w.sellPrice, discountPrice: w.discountPrice, buyPrice: w.buyPrice } }));
      for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
      priceCount += list.length;
    } catch (e) {
      notes.push(`${store.label}: fiyatlar yazılamadı (${errMsg(e)})`);
    }
  }
  await syncUser(user.id).catch((e) => notes.push(`Senkron: ${errMsg(e)}`));
  const summary = `Toplu güncelleme: ${stockCount} stok, ${priceCount} fiyat güncellendi.`;
  await db.syncLog.create({ data: { userId: user.id, level: notes.length ? "warn" : "info", message: `${summary}${notes.length ? ` Atlananlar: ${notes.slice(0, 20).join(" · ")}` : ""}`.slice(0, 1900) } });
  revalidatePath("/", "layout");
  go("/urunler/toplu", notes.length ? "hata" : "ok", notes.length ? `${summary} ${notes.length} satır atlandı: ${notes.slice(0, 5).join(" · ")}${notes.length > 5 ? " … (tamamı Kayıtlar'da)" : ""}` : summary);
}

/** CSV ile toplu (varyantsız) ürün ekleme: her satır seçili mağazalarda bir ürün. */
export async function bulkCreate(fd: FormData) {
  const user = await requireUser();
  const rows = await readCsv(fd);
  if (rows.length > 100) go("/urunler/toplu", "hata", "Toplu ürün eklemede tek seferde en fazla 100 satır yüklenebilir.");
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!stores.length) go("/urunler/toplu", "hata", "Önce mağaza bağlayın.");
  const existing = new Set((await db.storeVariant.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { sku: true } })).map((v) => v.sku));
  const notes: string[] = [];
  let created = 0;
  const list = (v: string | undefined) => (v ?? "").split(/[|,]/).map((x) => x.trim()).filter(Boolean);

  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    if (existing.has(r.sku)) { notes.push(`Satır ${line}: ${r.sku} zaten var`); continue; }
    const v = validateDraft({
      name: r.urun_adi, description: r.aciklama, type: "PHYSICAL", brand: r.marka,
      categories: list(r.kategori), tags: list(r.etiketler),
      variantTypes: [],
      variants: [{ values: [], sku: r.sku, barcode: r.barkod, sellPrice: csvNum(r.satis_fiyati), discountPrice: csvNum(r.indirimli_fiyat), buyPrice: csvNum(r.alis_fiyati), stock: csvNum(r.stok) ?? 0, isActive: true }],
      imageUrls: list(r.gorsel_url), storeIds: stores.map((s) => s.id),
    });
    if ("error" in v) { notes.push(`Satır ${line}: ${v.error}`); continue; }
    const images = v.draft.imageUrls.map((url) => ({ url }));
    let ok = 0;
    for (const store of stores) {
      try {
        const w = await createInStore(store, v.draft, images);
        if (w.length) notes.push(`Satır ${line} (${store.label}): ${w.join(", ")}`);
        ok++;
      } catch (e) {
        notes.push(`Satır ${line} (${store.label}): ${errMsg(e)}`);
      }
    }
    if (ok) { created++; existing.add(r.sku); }
  }
  await syncUser(user.id).catch((e) => notes.push(`Senkron: ${errMsg(e)}`));
  const summary = `Toplu ürün ekleme: ${created} / ${rows.length} ürün oluşturuldu.`;
  await db.syncLog.create({ data: { userId: user.id, level: notes.length ? "warn" : "info", message: `${summary}${notes.length ? ` ${notes.slice(0, 20).join(" · ")}` : ""}`.slice(0, 1900) } });
  revalidatePath("/", "layout");
  go("/urunler/toplu", notes.length ? "hata" : "ok", notes.length ? `${summary} ${notes.slice(0, 5).join(" · ")}${notes.length > 5 ? " … (tamamı Kayıtlar'da)" : ""}` : summary);
}

/** SKU'ları farklı olan iki varyantı elle eşleştirir. */
export async function addAlias(fd: FormData) {
  const user = await requireUser();
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (stores.length < 2) go("/urunler/eslestir", "hata", "İki mağaza bağlı olmalı.");
  const [a, b] = stores;
  const skuA = str(fd, "skuA"), skuB = str(fd, "skuB");
  const [rowA, rowB] = await Promise.all([
    db.storeVariant.findFirst({ where: { storeId: a.id, sku: skuA } }),
    db.storeVariant.findFirst({ where: { storeId: b.id, sku: skuB } }),
  ]);
  if (!rowA || !rowB) go("/urunler/eslestir", "hata", "Seçilen SKU'lar bulunamadı.");
  const taken = await db.storeVariant.findFirst({ where: { storeId: b.id, matchSku: rowA!.matchSku } });
  if (taken) go("/urunler/eslestir", "hata", `${a.label} tarafındaki ${skuA} zaten ${taken.sku} ile eşleşiyor.`);
  await db.skuAlias.upsert({
    where: { storeId_sku: { storeId: b.id, sku: skuB } },
    create: { storeId: b.id, sku: skuB, matchSku: rowA!.matchSku },
    update: { matchSku: rowA!.matchSku },
  });
  await syncUser(user.id).catch(() => {});
  await db.syncLog.create({ data: { userId: user.id, level: "info", sku: skuA, message: `Elle eşleştirildi: ${a.label} ${skuA} ↔ ${b.label} ${skuB}` } });
  revalidatePath("/", "layout");
  go("/urunler/eslestir", "ok", `${skuA} ↔ ${skuB} eşleştirildi ve ortak stoğa bağlandı.`);
}

export async function removeAlias(fd: FormData) {
  const user = await requireUser();
  const alias = await db.skuAlias.findFirst({ where: { id: str(fd, "id"), store: { userId: user.id } } });
  if (!alias) go("/urunler/eslestir", "hata", "Eşleştirme bulunamadı.");
  await db.$transaction([
    db.skuAlias.delete({ where: { id: alias!.id } }),
    db.sharedItem.deleteMany({ where: { userId: user.id, sku: alias!.matchSku } }),
    db.storeVariant.updateMany({ where: { store: { userId: user.id }, matchSku: alias!.matchSku }, data: { lastSeenStock: null } }),
  ]);
  await syncUser(user.id).catch(() => {});
  revalidatePath("/", "layout");
  go("/urunler/eslestir", "ok", "Eşleştirme kaldırıldı; mağaza stoklarına dokunulmadı.");
}
