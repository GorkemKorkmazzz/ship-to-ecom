"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertModule } from "@/lib/access";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

import { EXPENSE_CATEGORIES } from "@/lib/finance/ingest-core";
const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};
const back = (msg: string, ok = false): never => redirect(`/analiz/isletme-giderleri?${ok ? "tamam" : "hata"}=${encodeURIComponent(msg)}`);

/** İşletme gideri ekler. Dönem (başlangıç–bitiş, dahil) rapor aralığına gün bazında paylaştırılır. */
export async function addOperatingExpense(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "karlilik");
  const category = String(fd.get("category") ?? "");
  if (!(category in EXPENSE_CATEGORIES)) back("Kategori seçin.");
  const amount = num(fd.get("amount")), taxAmount = num(fd.get("taxAmount")), taxRate = num(fd.get("taxRate"));
  if (amount === null || !Number.isFinite(amount) || amount < 0) back("Tutar sıfır ya da pozitif bir sayı olmalı.");
  if (taxAmount !== null && (!Number.isFinite(taxAmount) || taxAmount < 0 || taxAmount > amount!)) back("KDV tutarı geçersiz.");
  const currency = String(fd.get("currency") ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) back("Para birimi üç harfli kod olmalı (ör. TRY).");
  const from = String(fd.get("periodStart") ?? ""), to = String(fd.get("periodEnd") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) back("Dönem başlangıcı ve bitişi gerekli; bitiş başlangıçtan önce olamaz.");
  const storeId = String(fd.get("storeId") ?? "") || null;
  if (storeId && !(await db.store.findFirst({ where: { id: storeId, userId: user.id }, select: { id: true } }))) back("Mağaza bulunamadı.");
  const incl = String(fd.get("taxInclusive") ?? "");
  await db.expense.create({ data: {
    userId: user.id, storeId, category, amount: amount!, currency, taxAmount, taxRate, taxInclusive: incl === "1" ? true : incl === "0" ? false : null,
    periodStart: new Date(`${from}T00:00:00+03:00`), periodEnd: new Date(`${to}T23:59:59+03:00`), note: String(fd.get("note") ?? "").trim().slice(0, 200) || null,
  } });
  revalidatePath("/analiz");
  back("İşletme gideri kaydedildi.", true);
}

/** Kaydı iptal eder (silinmez). Yalnızca kullanıcının kendi kaydı. */
export async function cancelOperatingExpense(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "karlilik");
  const r = await db.expense.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id }, data: { status: "CANCELLED" } });
  revalidatePath("/analiz");
  back(r.count ? "Kayıt iptal edildi." : "Kayıt bulunamadı.", !!r.count);
}
