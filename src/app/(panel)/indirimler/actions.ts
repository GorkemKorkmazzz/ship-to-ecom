"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateCampaigns } from "@/lib/cache";
import { db } from "@/lib/db";
import { addCoupon, deleteCampaigns, saveCampaign } from "@/lib/ikas";
import { requireUser } from "@/lib/session";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (key: "hata" | "ok", msg: string): never => redirect(`/indirimler?${key}=${encodeURIComponent(msg)}`);
// Form saatleri Türkiye saatiyle girilir.
const ts = (v: string) => (v ? new Date(`${v}:00+03:00`).getTime() : null);

export async function createCampaign(fd: FormData) {
  const user = await requireUser();
  const title = str(fd, "title");
  const type = str(fd, "type");
  const amount = Number(str(fd, "amount").replace(",", "."));
  const code = str(fd, "code").toUpperCase().replace(/\s+/g, "");
  const storeIds = fd.getAll("storeIds").map(String);
  const int = (k: string) => {
    const n = parseInt(str(fd, k), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  if (!title) back("hata", "Kampanya adı zorunlu.");
  if (!["RATIO", "FIXED_AMOUNT", "FREE_SHIPPING"].includes(type)) back("hata", "Kampanya türü geçersiz.");
  if (type !== "FREE_SHIPPING" && !(amount > 0)) back("hata", "İndirim değeri 0'dan büyük olmalı.");
  if (type === "RATIO" && amount > 100) back("hata", "Yüzde indirimi 100'ü geçemez.");
  const start = ts(str(fd, "start"));
  const end = ts(str(fd, "end"));
  if (start && end && end <= start) back("hata", "Bitiş tarihi başlangıçtan sonra olmalı.");

  const stores = await db.store.findMany({ where: { userId: user.id, id: { in: storeIds } }, orderBy: { createdAt: "asc" } });
  if (!stores.length) back("hata", "En az bir mağaza seçin.");

  const combine = fd.get("combine") === "on";
  const usageLimit = int("usageLimit");
  const usageLimitPerCustomer = int("usageLimitPerCustomer");
  const input = {
    title,
    type,
    applicablePrice: str(fd, "applicablePrice") === "DISCOUNT_PRICE" ? "DISCOUNT_PRICE" : "SELL_PRICE",
    canCombineWithOtherCampaigns: combine,
    hasCoupon: !!code,
    includeDiscountedProducts: fd.get("includeDiscounted") === "on",
    ...(type === "FREE_SHIPPING" ? { isFreeShipping: true } : { fixedDiscount: { amount } }),
    ...(start || end ? { dateRange: { ...(start ? { start } : {}), ...(end ? { end } : {}) } } : {}),
    ...(usageLimit ? { usageLimit } : {}),
    ...(usageLimitPerCustomer ? { usageLimitPerCustomer } : {}),
  };

  const results: string[] = [];
  let failed = false;
  for (const store of stores) {
    try {
      const id = await saveCampaign(store, input);
      if (code) await addCoupon(store, id, code, combine);
      results.push(`${store.label}: oluşturuldu`);
    } catch (e) {
      failed = true;
      results.push(`${store.label}: ${e instanceof Error ? e.message : e}`);
    }
    invalidateCampaigns(store.id);
  }
  await db.syncLog.create({
    data: { userId: user.id, level: failed ? "warn" : "info", message: `Kampanya "${title}" → ${results.join(" · ")}` },
  });
  revalidatePath("/indirimler");
  back(failed ? "hata" : "ok", results.join(" · "));
}

export async function removeCampaign(fd: FormData) {
  const user = await requireUser();
  let targets: { storeId: string; id: string }[] = [];
  try {
    targets = JSON.parse(str(fd, "targets"));
  } catch {
    back("hata", "İstek okunamadı.");
  }
  const stores = await db.store.findMany({ where: { userId: user.id } });
  const errors: string[] = [];
  for (const t of targets) {
    const store = stores.find((s) => s.id === t.storeId);
    if (!store) continue;
    try {
      await deleteCampaigns(store, [String(t.id)]);
    } catch (e) {
      errors.push(`${store.label}: ${e instanceof Error ? e.message : e}`);
    }
    invalidateCampaigns(store.id);
  }
  revalidatePath("/indirimler");
  if (errors.length) back("hata", errors.join(" · "));
  back("ok", "Kampanya silindi.");
}
