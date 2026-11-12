"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { priceOf } from "@/lib/plans";
import { requireUser } from "@/lib/session";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Fatura bilgilerini kaydeder ve bekleyen bir lisans siparişi oluşturur. */
export async function createOrder(fd: FormData) {
  const user = await requireUser();
  const price = priceOf(str(fd, "paket"), str(fd, "donem"));
  if (!price) redirect("/lisans");
  const backUrl = `/lisans/odeme?paket=${price!.plan.id}&donem=${price!.period}`;
  const fail = (msg: string): never => redirect(`${backUrl}&hata=${encodeURIComponent(msg)}`);

  const type = str(fd, "type") === "bireysel" ? "bireysel" : "kurumsal";
  const b = {
    type,
    name: str(fd, "name"),
    taxNumber: str(fd, "taxNumber").replace(/\s/g, ""),
    taxOffice: str(fd, "taxOffice"),
    address: str(fd, "address"),
    district: str(fd, "district"),
    city: str(fd, "city"),
    phone: str(fd, "phone"),
    email: str(fd, "email").toLowerCase(),
  };
  if (!b.name || !b.address || !b.district || !b.city || !b.phone) fail("Zorunlu alanları doldurun.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) fail("Geçerli bir fatura e-postası girin.");
  if (type === "bireysel" && !/^\d{11}$/.test(b.taxNumber)) fail("T.C. kimlik numarası 11 haneli olmalı.");
  if (type === "kurumsal" && !/^\d{10}$/.test(b.taxNumber)) fail("Vergi numarası 10 haneli olmalı.");
  if (type === "kurumsal" && !b.taxOffice) fail("Vergi dairesini girin.");
  if (fd.get("sozlesme") !== "on") fail("Devam etmek için satış koşullarını onaylayın.");

  await db.billingInfo.upsert({ where: { userId: user.id }, create: { userId: user.id, ...b }, update: b });
  // Aynı paket için bekleyen sipariş varsa yenisini açma.
  const open = await db.payment.findFirst({ where: { userId: user.id, status: "bekliyor", plan: price!.plan.id, period: price!.period } });
  const payment = open
    ? await db.payment.update({ where: { id: open.id }, data: { billingJson: JSON.stringify(b), amount: price!.amount, vat: price!.vat, total: price!.total } })
    : await db.payment.create({
        data: {
          userId: user.id, plan: price!.plan.id, period: price!.period,
          amount: price!.amount, vat: price!.vat, total: price!.total,
          reference: `STE-${randomBytes(4).toString("hex").toUpperCase()}`,
          billingJson: JSON.stringify(b),
        },
      });
  redirect(`/lisans/siparis?id=${payment.id}`);
}

/** Müşteri havaleyi yaptığını bildirir; onay yönetim panelinden verilir. */
export async function notifyTransfer(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "id");
  await db.payment.updateMany({ where: { id, userId: user.id, status: "bekliyor" }, data: { status: "bildirildi", method: "havale" } });
  redirect(`/lisans/siparis?id=${id}&ok=${encodeURIComponent("Bildiriminiz alındı. Ödemeniz kontrol edilince lisansınız etkinleşir.")}`);
}

export async function cancelOrder(fd: FormData) {
  const user = await requireUser();
  await db.payment.updateMany({ where: { id: str(fd, "id"), userId: user.id, status: { in: ["bekliyor", "bildirildi"] } }, data: { status: "iptal" } });
  redirect(`/lisans?ok=${encodeURIComponent("Sipariş iptal edildi.")}`);
}
