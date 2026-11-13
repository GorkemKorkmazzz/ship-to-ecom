"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { invalidateUser } from "@/lib/cache";
import { db } from "@/lib/db";
import { cancelOrderLines, fulfillOrder, updatePackageStatus, type Tracking } from "@/lib/ikas";
import { requireUser } from "@/lib/session";
import { syncUser } from "@/lib/sync";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
type Pkg = { id: string | null; status: string | null; lineIds: string[] };

/** Sipariş durumunu ikas'ta günceller, sonra siparişi ikas'tan yeniden okur. */
export async function updateOrder(fd: FormData) {
  const user = await requireUser();
  const back = str(fd, "back") || "/siparisler";
  const go = (key: "hata" | "ok", msg: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
  const order = await db.order.findFirst({ where: { id: str(fd, "id"), store: { userId: user.id } }, include: { store: true, lines: true } });
  if (!order) go("hata", "Sipariş bulunamadı.");
  const { store } = order!;
  const action = str(fd, "action");
  const notify = fd.get("notify") === "on";
  const tracking: Tracking = { cargoCompany: str(fd, "cargoCompany"), trackingNumber: str(fd, "trackingNumber"), trackingLink: str(fd, "trackingLink"), isSendNotification: notify };
  if (tracking.trackingLink && !/^https?:\/\//i.test(tracking.trackingLink)) go("hata", "Takip bağlantısı http(s):// ile başlamalı.");

  let packages: Pkg[] = [];
  try {
    packages = JSON.parse(order!.packages);
  } catch {}
  const packaged = new Set(packages.flatMap((p) => p.lineIds ?? []));
  const lines = order!.lines.filter((l) => l.ikasLineId);
  if (!lines.length) go("hata", "Bu sipariş güncel bilgilerle senkronize edilmemiş; önce “Şimdi senkronize et”e basın.");
  const unpackaged = lines.filter((l) => !packaged.has(l.ikasLineId!)).map((l) => ({ orderLineItemId: l.ikasLineId!, quantity: l.quantity }));
  const pkgIds = packages.filter((p) => p.id && p.status !== "CANCELLED").map((p) => p.id!);

  let done = "";
  try {
    if (action === "hazir" || action === "kargolandi") {
      const status = action === "hazir" ? "READY_FOR_SHIPMENT" : "FULFILLED";
      if (unpackaged.length) await fulfillOrder(store, order!.ikasOrderId, unpackaged, { readyOnly: action === "hazir", notify, tracking });
      else if (pkgIds.length) for (const id of pkgIds) await updatePackageStatus(store, order!.ikasOrderId, id, status, tracking);
      else go("hata", "Güncellenecek paket ya da ürün satırı bulunamadı.");
      done = action === "hazir" ? "Sipariş kargoya hazır olarak işaretlendi." : "Sipariş kargolandı olarak işaretlendi.";
    } else if (action === "teslim") {
      if (!pkgIds.length) go("hata", "Teslim edildi demek için önce siparişin kargolanmış olması gerekir.");
      for (const id of pkgIds) await updatePackageStatus(store, order!.ikasOrderId, id, "DELIVERED");
      done = "Sipariş teslim edildi olarak işaretlendi.";
    } else if (action === "iptal") {
      if (fd.get("confirm") !== "on") go("hata", "İptal için onay kutusunu işaretleyin.");
      await cancelOrderLines(store, order!.ikasOrderId, lines.map((l) => ({ orderLineItemId: l.ikasLineId!, quantity: l.quantity })), fd.get("restock") === "on");
      done = "Sipariş ikas'ta iptal edildi.";
    } else go("hata", "İşlem seçin.");
  } catch (e) {
    await db.syncLog.create({ data: { userId: user.id, level: "error", storeLabel: store.label, message: `Sipariş #${order!.orderNumber} güncellenemedi: ${e instanceof Error ? e.message : e}`.slice(0, 900) } });
    go("hata", `ikas güncellemeyi kabul etmedi: ${e instanceof Error ? e.message : e}`.slice(0, 400));
  }

  // ikas'taki son durumu geri oku (son 5 dakikada güncellenen siparişler yeniden çekilir).
  await syncUser(user.id).catch(() => {});
  await db.syncLog.create({ data: { userId: user.id, level: "info", storeLabel: store.label, message: `Sipariş #${order!.orderNumber}: ${done}` } });
  revalidatePath("/", "layout");
  go("ok", `#${order!.orderNumber}: ${done}`);
}

/** Siparişleri panelden kaldırır (tekli ya da toplu). ikas'taki sipariş silinmez; "Silinenler"den geri alınabilir. */
async function setDeleted(fd: FormData, deleted: boolean) {
  const user = await requireUser();
  const back = str(fd, "back") || "/siparisler";
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  const go = (key: "hata" | "ok", msg: string): never => redirect(`${back}${back.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`);
  if (!ids.length) go("hata", "Önce sipariş seçin.");
  const r = await db.order.updateMany({ where: { id: { in: ids }, store: { userId: user.id } }, data: { deletedAt: deleted ? new Date() : null } });
  await db.syncLog.create({ data: { userId: user.id, level: "info", message: `${r.count} sipariş ${deleted ? "panelden silindi" : "geri alındı"}.` } });
  invalidateUser(user.id);
  revalidatePath("/", "layout");
  go("ok", `${r.count} sipariş ${deleted ? "silindi. Silinenler bölümünden geri alabilirsiniz." : "geri alındı."}`);
}

export async function deleteOrders(fd: FormData) {
  await setDeleted(fd, true);
}

export async function restoreOrders(fd: FormData) {
  await setDeleted(fd, false);
}
