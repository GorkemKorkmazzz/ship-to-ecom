import { db } from "./db";

export type NewNotification = { userId: string; kind: "stock" | "automation"; title: string; body: string; link?: string | null };

/** Panel bildirimi oluşturur. Bildirim yazılamazsa çağıran işlem (senkron, otomasyon) durmaz. */
export async function notify(items: NewNotification[]) {
  if (!items.length) return;
  await db.notification.createMany({ data: items.map((n) => ({ ...n, title: n.title.slice(0, 200), body: n.body.slice(0, 1000) })) }).catch((e) => console.error("bildirim", e));
}
