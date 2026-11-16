"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertModule } from "@/lib/access";
import { addManualCost } from "@/lib/finance/costs";
import { requireUser } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

/** Elle maliyet kaydı: tarih Türkiye saatiyle gün başından geçerli olur. Sipariş snapshot'ları değişmez. */
export async function saveCost(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "karlilik");
  const storeId = String(fd.get("storeId") ?? ""), sku = String(fd.get("sku") ?? "").trim(), from = String(fd.get("validFrom") ?? "");
  const currency = String(fd.get("currency") ?? "").trim().toUpperCase();
  const back = (msg: string, ok = false) => redirect(`/analiz/maliyetler?sku=${encodeURIComponent(sku)}&${ok ? "tamam" : "hata"}=${encodeURIComponent(msg)}`);
  if (!storeId || !sku || !/^\d{4}-\d{2}-\d{2}$/.test(from)) back("Mağaza, SKU ve başlangıç tarihi gerekli.");
  if (!/^[A-Z]{3}$/.test(currency)) back("Para birimi üç harfli kod olmalı (ör. TRY).");
  const purchase = num(fd.get("purchaseCost"));
  if (purchase === null) back("Alış maliyeti gerekli.");
  try {
    const total = await addManualCost(user.id, {
      storeId, sku, currency, validFrom: new Date(`${from}T00:00:00+03:00`), purchaseCost: purchase!,
      productionCost: num(fd.get("productionCost")), packagingCost: num(fd.get("packagingCost")), labelCost: num(fd.get("labelCost")), otherCost: num(fd.get("otherCost")),
      note: String(fd.get("note") ?? "").trim().slice(0, 200) || null,
    });
    revalidatePath("/analiz");
    back(`Kaydedildi: birim maliyet ${total} ${currency}, ${from} tarihinden itibaren.`, true);
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect
    back(e instanceof Error ? e.message : "Kaydedilemedi.");
  }
}
