"use server";

import { assertModule } from "@/lib/access";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTIONS, RULE_SLOTS as SLOTS, validateRule, type Action, type Condition, type Field } from "@/lib/automation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

const BASE = "/otomasyonlar";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const go = (key: "hata" | "ok", msg: string): never => redirect(`${BASE}?${key}=${encodeURIComponent(msg)}`);

export async function createRule(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "otomasyon");
  const name = str(fd, "name").slice(0, 80);
  if (!name) go("hata", "Kural adı zorunlu.");
  const stores = await db.store.findMany({ where: { userId: user.id }, select: { id: true } });
  const conditions: Condition[] = [];
  const actions: Action[] = [];
  for (let i = 0; i < SLOTS; i++) {
    const [field, op] = str(fd, `c${i}_kind`).split(":");
    const value = field === "magaza" ? str(fd, `c${i}_store`) : str(fd, `c${i}_value`);
    if (field) conditions.push({ field: field as Field, op, value: value.slice(0, 100) });
    const type = str(fd, `a${i}_type`);
    if (type) actions.push({ type: type as keyof typeof ACTIONS, value: str(fd, `a${i}_value`).slice(0, 300) });
  }
  // Mağaza koşulu yalnızca kullanıcının kendi mağazalarını gösterebilir.
  if (conditions.some((c) => c.field === "magaza" && !stores.some((s) => s.id === c.value))) go("hata", "Mağaza seçin.");
  const err = validateRule(conditions, actions);
  if (err) go("hata", err);
  await db.automationRule.create({ data: { userId: user.id, name, conditions: JSON.stringify(conditions), actions: JSON.stringify(actions) } });
  revalidatePath(BASE);
  go("ok", `"${name}" kuralı oluşturuldu. Bundan sonra gelen siparişlere uygulanır.`);
}

export async function toggleRule(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "otomasyon");
  const rule = await db.automationRule.findFirst({ where: { id: str(fd, "id"), userId: user.id } });
  if (!rule) go("hata", "Kural bulunamadı.");
  await db.automationRule.update({ where: { id: rule!.id }, data: { active: !rule!.active } });
  revalidatePath(BASE);
  go("ok", `"${rule!.name}" ${rule!.active ? "pasif" : "aktif"} yapıldı.`);
}

export async function deleteRule(fd: FormData) {
  const user = await requireUser();
  assertModule(user, "otomasyon");
  const r = await db.automationRule.deleteMany({ where: { id: str(fd, "id"), userId: user.id } });
  revalidatePath(BASE);
  go(r.count ? "ok" : "hata", r.count ? "Kural silindi. Siparişlere eklenmiş etiketler korunur." : "Kural bulunamadı.");
}
