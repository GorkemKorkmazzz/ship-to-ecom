"use server";

import { hasModule } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { ImageSource } from "@/lib/ikas";
import { createInStore, validateDraft, type StoreResult } from "@/lib/product";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

export type CreateState = { error?: string; results?: StoreResult[]; done?: number };

const MAX_IMAGES = 10;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function createProduct(_prev: CreateState, fd: FormData): Promise<CreateState> {
  const user = await requireUser();
  if (!hasModule(user, "urun")) return { error: "Ürün ekleme Profesyonel paketinde. Kullanmak için paketinizi yükseltin." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("payload") ?? ""));
  } catch {
    return { error: "Form verisi okunamadı." };
  }
  const v = validateDraft(raw);
  if ("error" in v) return { error: v.error };
  const draft = v.draft;

  const stores = await db.store.findMany({ where: { userId: user.id, id: { in: draft.storeIds } }, orderBy: { createdAt: "asc" } });
  if (!stores.length) return { error: "Seçilen mağaza bulunamadı." };

  // Aynı SKU mağazada zaten varsa ikinci kez oluşturma (stok eşleşmesi bozulur).
  const clash = await db.storeVariant.findFirst({
    where: { storeId: { in: stores.map((s) => s.id) }, sku: { in: draft.variants.map((x) => x.sku) } },
    include: { store: true },
  });
  if (clash) return { error: `"${clash.sku}" SKU'su ${clash.store.label} mağazasında zaten var.` };

  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length + draft.imageUrls.length > MAX_IMAGES) return { error: `En fazla ${MAX_IMAGES} görsel eklenebilir.` };
  const images: ImageSource[] = [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) return { error: `${f.name} bir görsel dosyası değil.` };
    if (f.size > MAX_IMAGE_BYTES) return { error: `${f.name} 5 MB'tan büyük.` };
    images.push({ base64: Buffer.from(await f.arrayBuffer()).toString("base64") });
  }
  for (const url of draft.imageUrls) images.push({ url });

  const results: StoreResult[] = [];
  for (const store of stores) {
    try {
      const warnings = await createInStore(store, draft, images);
      results.push({
        store: store.label,
        ok: true,
        message: warnings.length ? `Ürün oluşturuldu, ancak: ${warnings.join(" · ")}` : "Ürün oluşturuldu.",
      });
    } catch (e) {
      results.push({ store: store.label, ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (results.some((r) => r.ok)) {
    // Formdaki marka ve ilk kategori Tanımlamalar'a eklenir ve yeni SKU'lara atanır (toplu fiyat değişimi için).
    const category = draft.categories[0] ?? null;
    const brand = draft.brand || null;
    for (const [kind, name] of [["category", category], ["brand", brand]] as const)
      if (name) await db.definition.upsert({ where: { userId_kind_name: { userId: user.id, kind, name } }, create: { userId: user.id, kind, name }, update: {} });
    if (category || brand)
      for (const v of draft.variants)
        await db.skuSetting.upsert({ where: { userId_sku: { userId: user.id, sku: v.sku } }, create: { userId: user.id, sku: v.sku, category, brand }, update: { category, brand } });
    // Yeni varyantları panele al ve ortak stoğa bağla.
    await syncUser(user.id).catch(() => {});
    await db.syncLog.create({
      data: {
        userId: user.id,
        level: results.every((r) => r.ok) ? "info" : "warn",
        sku: draft.variants[0].sku,
        message: `Ürün eklendi: ${draft.name} (${results.map((r) => `${r.store}: ${r.ok ? "tamam" : "hata"}`).join(", ")})`,
      },
    });
    revalidatePath("/", "layout");
  }
  return { results, done: Date.now() };
}
