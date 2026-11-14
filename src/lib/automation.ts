// Sipariş otomasyonu: senkronla gelen siparişlere kullanıcının kurallarını uygular.
// Koşullar VE ile bağlanır. Bir kural bir siparişte yalnızca bir kez çalışır (AutomationRun tekil anahtarı);
// tekrarlanan webhook ya da senkron aynı aksiyonu ikinci kez çalıştırmaz.
// Kural yalnızca kendisi oluşturulduktan sonra verilen siparişlere uygulanır.
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { notify, type NewNotification } from "./notify";

export const FIELDS = {
  tutar: { label: "Sipariş tutarı", ops: ["gte", "lte"] },
  magaza: { label: "Mağaza", ops: ["eq"] },
  urun: { label: "Üründe SKU", ops: ["eq"] },
  stok: { label: "Siparişteki bir ürünün ortak stoğu", ops: ["lte"] },
  durum: { label: "Sipariş / paket durumu", ops: ["eq"] },
} as const;
export const OPS: Record<string, string> = { gte: "en az", lte: "en fazla", eq: "eşit" };
export const ACTIONS = { etiket: "Etiket ekle", bildirim: "Bildirim gönder", stok_kontrol: "Stok kontrolü yap" } as const;

export type Field = keyof typeof FIELDS;
export type Condition = { field: Field; op: string; value: string };
export type Action = { type: keyof typeof ACTIONS; value: string };

/** Formdaki koşul ve aksiyon satırı sayısı. */
export const RULE_SLOTS = 3;

const num = (v: string) => Number(v.replace(",", "."));

/** Formdan gelen koşul/aksiyonları doğrular; hata varsa metni döner. */
export function validateRule(conditions: Condition[], actions: Action[]): string | null {
  if (!conditions.length) return "En az bir koşul ekleyin.";
  if (!actions.length) return "En az bir aksiyon ekleyin.";
  for (const c of conditions) {
    const f = FIELDS[c.field];
    if (!f || !(f.ops as readonly string[]).includes(c.op)) return "Koşul geçersiz.";
    if (!c.value.trim()) return `"${f.label}" koşulunun değeri boş.`;
    if ((c.field === "tutar" || c.field === "stok") && !Number.isFinite(num(c.value))) return `"${f.label}" için sayı girin.`;
  }
  for (const a of actions) {
    if (!(a.type in ACTIONS)) return "Aksiyon geçersiz.";
    if (!a.value.trim()) return `"${ACTIONS[a.type]}" aksiyonunun değeri boş.`;
    if (a.type === "stok_kontrol" && !Number.isFinite(num(a.value))) return "Stok kontrolü için eşik sayısı girin.";
  }
  return null;
}

export const parse = <T>(json: string): T[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

type OrderCtx = Prisma.OrderGetPayload<{ include: { lines: true; store: true } }>;

export function matches(c: Condition, o: OrderCtx, stockOf: (sku: string) => number | null): boolean {
  switch (c.field) {
    case "tutar":
      return c.op === "gte" ? o.totalFinalPrice >= num(c.value) : o.totalFinalPrice <= num(c.value);
    case "magaza":
      return o.storeId === c.value;
    case "urun":
      return o.lines.some((l) => l.sku.toLocaleLowerCase("tr") === c.value.trim().toLocaleLowerCase("tr"));
    case "stok":
      return o.lines.some((l) => {
        const s = stockOf(l.sku);
        return s !== null && s <= num(c.value);
      });
    case "durum":
      return [o.status, o.packageStatus, o.paymentStatus].some((x) => x && x.toLocaleLowerCase("tr") === c.value.trim().toLocaleLowerCase("tr"));
    default:
      return false;
  }
}

/** Verilen siparişlere aktif kuralları uygular. Hata olursa senkronu durdurmaz. */
export async function runAutomations(userId: string, orderIds: string[]) {
  if (!orderIds.length) return;
  const rules = await db.automationRule.findMany({ where: { userId, active: true } });
  if (!rules.length) return;
  const orders = await db.order.findMany({ where: { id: { in: orderIds }, deletedAt: null, store: { userId } }, include: { lines: true, store: true } });
  // Satır SKU'su mağaza SKU'sudur; ortak stok eşleşme anahtarıyla (matchSku) tutulur.
  const variants = await db.storeVariant.findMany({ where: { store: { userId } }, select: { storeId: true, sku: true, matchSku: true } });
  const shared = new Map((await db.sharedItem.findMany({ where: { userId }, select: { sku: true, sharedStock: true } })).map((s) => [s.sku, s.sharedStock]));
  const alerts: NewNotification[] = [];

  for (const rule of rules) {
    const conditions = parse<Condition>(rule.conditions);
    const actions = parse<Action>(rule.actions);
    if (!conditions.length || !actions.length) continue;
    let ran = 0;
    for (const o of orders) {
      if (!o.orderedAt || o.orderedAt < rule.createdAt) continue;
      const stockOf = (sku: string) => {
        const key = variants.find((v) => v.storeId === o.storeId && v.sku === sku)?.matchSku ?? sku;
        return shared.get(key) ?? null;
      };
      if (!conditions.every((c) => matches(c, o, stockOf))) continue;
      try {
        await db.automationRun.create({ data: { ruleId: rule.id, orderId: o.id } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // zaten çalıştı
        throw e;
      }
      ran++;
      const tags = new Set(parse<string>(o.tags));
      for (const a of actions) {
        if (a.type === "etiket") tags.add(a.value.trim().slice(0, 40));
        if (a.type === "bildirim") alerts.push({ userId, kind: "automation", title: `${rule.name}: #${o.orderNumber}`, body: a.value.slice(0, 500), link: `/siparisler?q=${encodeURIComponent(o.orderNumber)}` });
        if (a.type === "stok_kontrol") {
          const low = o.lines.map((l) => ({ l, s: stockOf(l.sku) })).filter((x) => x.s !== null && x.s <= num(a.value));
          if (low.length)
            alerts.push({ userId, kind: "stock", title: `Stok kontrolü: #${o.orderNumber}`, body: low.map((x) => `${x.l.name || x.l.sku} (${x.l.sku}): ${x.s} adet`).join(" · "), link: `/stok?f=dusuk` });
        }
      }
      if (tags.size !== parse<string>(o.tags).length) {
        await db.order.update({ where: { id: o.id }, data: { tags: JSON.stringify([...tags]) } });
        o.tags = JSON.stringify([...tags]); // aynı turdaki sonraki kural mevcut etiketleri görsün
      }
    }
    if (ran) await db.automationRule.update({ where: { id: rule.id }, data: { runCount: { increment: ran }, lastRunAt: new Date() } });
  }
  await notify(alerts);
}
