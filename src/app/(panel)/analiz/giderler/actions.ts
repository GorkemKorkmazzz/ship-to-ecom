"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { assertModule } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { TXN_TYPES, ingestTransactions, type TxnType } from "@/lib/finance/ingest";
import { requireUser } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};
const back = (msg: string, ok = false): never => redirect(`/analiz/giderler?${ok ? "tamam" : "hata"}=${encodeURIComponent(msg)}`);

/** Elle sipariş/satış gideri: ortak finansal kayıt olarak eklenir (kaynak MANUAL). */
export async function addExpense(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "karlilik");
  const type = String(fd.get("type") ?? "") as TxnType;
  if (!(type in TXN_TYPES) || type === "SHIPPING_INCOME") back("Gider türü seçin.");
  const amount = num(fd.get("amount")), taxAmount = num(fd.get("taxAmount")), taxRate = num(fd.get("taxRate"));
  const day = String(fd.get("occurredAt") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) back("Tarih gerekli.");
  const incl = String(fd.get("taxInclusive") ?? "");
  // Sipariş numarası verildiyse yalnızca kullanıcının mağazalarındaki sipariş aranır.
  const no = String(fd.get("orderNumber") ?? "").trim();
  const storeId = String(fd.get("storeId") ?? "") || null;
  let orderId: string | null = null;
  if (no) {
    const hits = await db.order.findMany({ where: { orderNumber: no, store: { userId: user.id }, ...(storeId ? { storeId } : {}) }, select: { id: true, storeId: true }, take: 2 });
    if (hits.length !== 1) back(hits.length ? "Bu numarada birden fazla sipariş var; mağaza seçin." : "Sipariş bulunamadı.");
    orderId = hits[0].id;
  }
  // Dağıtım yöntemi: elle dağıtımda "SKU=tutar; SKU=tutar" biçimi; toplam gider tutarını aşamaz.
  const method = String(fd.get("method") ?? "REVENUE") as "REVENUE" | "QUANTITY" | "WEIGHT" | "MANUAL";
  const manual: { sku: string; amount: number }[] = [];
  if (method === "MANUAL") {
    if (!orderId) back("Elle dağıtım için sipariş numarası gerekli.");
    for (const part of String(fd.get("manual") ?? "").split(/[;\n]/).map((x) => x.trim()).filter(Boolean)) {
      const [sku, val] = part.split("=").map((x) => x.trim());
      const v = Number((val ?? "").replace(",", "."));
      if (!sku || !Number.isFinite(v) || v < 0) back(`Elle dağıtım satırı okunamadı: "${part}" (biçim: SKU=tutar).`);
      manual.push({ sku, amount: v });
    }
    if (!manual.length) back("Elle dağıtım için en az bir SKU=tutar girin.");
    if (manual.reduce((a, m) => a + m.amount, 0) > (amount ?? 0) + 0.005) back("Elle dağıtım toplamı gider tutarını aşamaz.");
    const skus = new Set((await db.orderLine.findMany({ where: { orderId: orderId! }, select: { sku: true } })).map((l) => l.sku));
    const bad = manual.find((m) => !skus.has(m.sku));
    if (bad) back(`"${bad.sku}" bu siparişte yok.`);
  }
  const externalId = `manual:${randomToken(12)}`;
  const res = await ingestTransactions(user.id, [{
    source: "MANUAL", externalId, type, allocationMethod: method, direction: "DEBIT", amount: amount ?? NaN, currency: String(fd.get("currency") ?? "").trim().toUpperCase(),
    taxAmount, taxRate, taxInclusive: incl === "1" ? true : incl === "0" ? false : null, occurredAt: new Date(`${day}T12:00:00+03:00`),
    storeId, orderId, note: String(fd.get("note") ?? "").trim().slice(0, 200) || null,
  }]);
  if (res.rejected.length) back(res.rejected[0].reason);
  if (manual.length) {
    const t = await db.financialTransaction.findFirstOrThrow({ where: { userId: user.id, source: "MANUAL", externalId }, select: { id: true } });
    await db.costAllocation.createMany({ data: manual.map((m) => ({ transactionId: t.id, sku: m.sku, amount: m.amount })) });
  }
  revalidatePath("/analiz");
  back("Gider kaydedildi.", true);
}

/** Elle girilen kaydı iptal eder (silinmez; iptal edilen kayıt hesaba girmez). Yalnızca kullanıcının MANUAL kayıtları. */
export async function cancelExpense(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "karlilik");
  const r = await db.financialTransaction.updateMany({ where: { id: String(fd.get("id") ?? ""), userId: user.id, source: "MANUAL" }, data: { status: "CANCELLED" } });
  revalidatePath("/analiz");
  back(r.count ? "Kayıt iptal edildi." : "Kayıt bulunamadı.", !!r.count);
}
