// Ana sayfa (Özet) verisi: seçili dönem ve bir önceki eş uzunluktaki dönem, mağaza performansı,
// stok durumu, akıllı özetler ve son işlemler. Hepsi veritabanındaki gerçek kayıtlardan hesaplanır.
import type { Store } from "@prisma/client";
import { buildAnalysis } from "./analysis";
import { db } from "./db";

const DAY = 24 * 3600_000;
const TZ = "Europe/Istanbul";
export const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Önceki döneme göre değişim (%). Önceki dönem 0 ise karşılaştırma yapılmaz. */
const change = (now: number, prev: number) => (prev > 0 ? Math.round(((now - prev) / prev) * 1000) / 10 : null);
const REFUND = /REFUND/;
const CANCELLED = ["CANCELLED", "DRAFT"];

export type Metric = { value: number; prev: number; change: number | null; spark: number[] };

export async function buildDashboard(userId: string, stores: Store[], range: number, storeId?: string) {
  const shown = stores.filter((s) => !storeId || s.id === storeId);
  const ids = shown.map((s) => s.id);
  // Türkiye saatiyle bugün dahil son `range` gün; karşılaştırma için ondan önceki `range` gün.
  const today0 = new Date(`${dayKey(new Date())}T00:00:00+03:00`);
  const start = new Date(today0.getTime() - (range - 1) * DAY);
  const prevStart = new Date(start.getTime() - range * DAY);
  const days = Array.from({ length: range }, (_, i) => dayKey(new Date(start.getTime() + i * DAY + 12 * 3600_000)));
  const prevDays = days.map((_, i) => dayKey(new Date(prevStart.getTime() + i * DAY + 12 * 3600_000)));

  const [orders, carts, logs, user] = await Promise.all([
    db.order.findMany({
      where: { storeId: { in: ids }, deletedAt: null, orderedAt: { gte: prevStart } },
      select: { id: true, storeId: true, orderNumber: true, currency: true, totalFinalPrice: true, orderedAt: true, status: true, packageStatus: true, lines: { select: { sku: true, name: true, quantity: true } } },
      orderBy: { orderedAt: "desc" },
    }),
    db.abandonedCart.count({ where: { storeId: { in: ids }, lastActivityAt: { gte: start }, NOT: { status: "COMPLETED" }, OR: [{ recoveryStatus: null }, { recoveryStatus: { not: "RECOVERED" } }] } }),
    db.syncLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 12 }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { lastSyncAt: true } }),
  ]);

  const inCur = (o: (typeof orders)[number]) => !!o.orderedAt && o.orderedAt >= start;
  const sold = orders.filter((o) => !CANCELLED.includes(o.status));
  const cur = sold.filter(inCur);
  const prev = sold.filter((o) => !inCur(o));
  const refunds = (list: typeof orders) => list.filter((o) => REFUND.test(o.status) || REFUND.test(o.packageStatus ?? "")).length;
  const units = (list: typeof orders) => list.reduce((a, o) => a + o.lines.reduce((b, l) => b + l.quantity, 0), 0);
  const revenue = (list: typeof orders) => list.reduce((a, o) => a + o.totalFinalPrice, 0);

  // Günlük seriler (bu dönem ve önceki dönem aynı gün sırasıyla)
  const series = (list: typeof orders, keys: string[], f: (o: (typeof orders)[number]) => number) => {
    const out = keys.map(() => 0);
    for (const o of list) {
      const i = keys.indexOf(dayKey(o.orderedAt!));
      if (i >= 0) out[i] += f(o);
    }
    return out.map(r2);
  };
  const daily = {
    ciro: { now: series(cur, days, (o) => o.totalFinalPrice), prev: series(prev, prevDays, (o) => o.totalFinalPrice) },
    siparis: { now: series(cur, days, () => 1), prev: series(prev, prevDays, () => 1) },
    urun: { now: series(cur, days, (o) => o.lines.reduce((a, l) => a + l.quantity, 0)), prev: series(prev, prevDays, (o) => o.lines.reduce((a, l) => a + l.quantity, 0)) },
  };
  const refundSeries = series(orders.filter(inCur).filter((o) => REFUND.test(o.status) || REFUND.test(o.packageStatus ?? "")), days, () => 1);

  const metric = (now: number, before: number, spark: number[]): Metric => ({ value: r2(now), prev: r2(before), change: change(now, before), spark });
  const avg = (list: typeof orders) => (list.length ? revenue(list) / list.length : 0);
  // Sepet dönüşümü: tamamlanan siparişlerin (sipariş + terk edilen sepet) içindeki payı. Ziyaretçi verisi alınmadığı için site dönüşümü değildir.
  const conversion = cur.length + carts ? (cur.length / (cur.length + carts)) * 100 : 0;
  const kpis = {
    ciro: metric(revenue(cur), revenue(prev), daily.ciro.now),
    siparis: metric(cur.length, prev.length, daily.siparis.now),
    urun: metric(units(cur), units(prev), daily.urun.now),
    ortalama: metric(avg(cur), avg(prev), daily.ciro.now.map((v, i) => (daily.siparis.now[i] ? v / daily.siparis.now[i] : 0))),
    iade: metric(refunds(orders.filter(inCur)), refunds(orders.filter((o) => !inCur(o))), refundSeries),
    donusum: { value: Math.round(conversion * 10) / 10, prev: 0, change: null, spark: [] as number[], carts } ,
  };

  const total = revenue(cur);
  const storePerf = shown.map((s) => {
    const mine = cur.filter((o) => o.storeId === s.id);
    const before = prev.filter((o) => o.storeId === s.id);
    return {
      id: s.id, label: s.label, platform: s.platform, error: s.lastError,
      ciro: r2(revenue(mine)), change: change(revenue(mine), revenue(before)), siparis: mine.length,
      sepet: r2(avg(mine)), pay: total ? Math.round((revenue(mine) / total) * 100) : 0,
    };
  });

  // En çok satan ürün (adet)
  const bySku = new Map<string, { name: string; qty: number }>();
  for (const o of cur) for (const l of o.lines) {
    const r = bySku.get(l.sku) ?? { name: l.name || l.sku, qty: 0 };
    r.qty += l.quantity;
    bySku.set(l.sku, r);
  }
  const top = [...bySku.values()].sort((a, b) => b.qty - a.qty)[0] ?? null;

  // Stok: kârlılık analiziyle aynı hesap (seçili dönemin satış hızı)
  const a = await buildAnalysis(userId, { start, end: new Date(), days: range }, 30);
  const [keys, sharedKeys] = await Promise.all([
    db.storeVariant.groupBy({ by: ["matchSku"], where: { storeId: { in: stores.map((s) => s.id) } } }).then((r) => new Set(r.map((x) => x.matchSku))),
    db.sharedItem.findMany({ where: { userId }, select: { sku: true } }),
  ]);
  // Yalnızca mağazalarda hâlâ bulunan SKU'lar sayılır (eski ortak stok kayıtları oranı %100'ün üstüne çıkarmasın).
  const variantCount = keys.size;
  const sharedCount = sharedKeys.filter((s) => keys.has(s.sku)).length;
  const ending = a.kritik.filter((p) => p.kalanGun !== null).map((p) => p.kalanGun!);
  const soonest = [...a.urunler, ...a.kritik].map((p) => p.kalanGun).filter((d): d is number => d !== null).sort((x, y) => x - y)[0] ?? null;
  const stock = { urun: variantCount, eslesen: sharedCount, oran: variantCount ? Math.round((sharedCount / variantCount) * 100) : 0, kritik: a.kritik.length, bitis: soonest };

  // Akıllı özetler (yalnızca verinin söylediği)
  const insights: { tone: "up" | "down" | "info" | "warn" | "ok"; text: string; strong?: string; link?: { href: string; label: string } }[] = [];
  if (kpis.ciro.change !== null)
    insights.push({ tone: kpis.ciro.change >= 0 ? "up" : "down", text: `Bu dönem cironuz önceki ${range} güne göre`, strong: `%${Math.abs(kpis.ciro.change)} ${kpis.ciro.change >= 0 ? "arttı" : "azaldı"}.` });
  else if (cur.length) insights.push({ tone: "info", text: `Önceki ${range} günde satış olmadığı için karşılaştırma yapılamıyor.` });
  if (top) insights.push({ tone: "info", text: "En çok satan ürününüz:", strong: `${top.name} (${top.qty} adet)` });
  if (a.kritik.length) insights.push({ tone: "warn", text: `${a.kritik.length} ürünün stoğu tükenmek üzere${ending.length ? ` (en erken ${Math.min(...ending)} gün)` : ""}.`, link: { href: "/analiz", label: "Hemen kontrol edin" } });
  const broken = stores.filter((s) => s.lastError);
  insights.push(broken.length
    ? { tone: "down", text: `${broken.map((s) => s.label).join(", ")} senkronizasyonunda hata var.`, link: { href: "/entegrasyonlar", label: "Entegrasyonlara git" } }
    : { tone: "ok", text: stores.length ? "Mağazalarınız senkronize ve sorunsuz çalışıyor." : "Henüz bağlı mağaza yok." });

  // Son işlemler: yeni siparişler ve senkron kayıtları, zamana göre
  const label = (id: string) => stores.find((s) => s.id === id)?.label ?? "";
  const activity = [
    ...orders.slice(0, 8).filter((o) => o.orderedAt).map((o) => ({ kind: "order" as const, title: `Yeni sipariş #${o.orderNumber}`, sub: label(o.storeId), at: o.orderedAt!.toISOString() })),
    ...logs.map((l) => ({
      kind: l.level === "error" ? ("error" as const) : /Ortak stok|stoğa bağlandı|Stok/i.test(l.message) ? ("stock" as const) : /eşleştir/i.test(l.message) ? ("match" as const) : ("info" as const),
      title: l.level === "error" ? "Senkronizasyon hatası" : l.message.length > 60 ? `${l.message.slice(0, 60)}…` : l.message,
      sub: [l.storeLabel, l.sku].filter(Boolean).join(" · "),
      at: l.createdAt.toISOString(),
    })),
  ]
    .sort((x, y) => y.at.localeCompare(x.at))
    // Tekrarlayan aynı kayıt (ör. her senkronda aynı uyarı) bir kez gösterilir.
    .filter((x, i, all) => all.findIndex((o) => o.title === x.title && o.sub === x.sub) === i)
    .slice(0, 6);

  return { range, currency: orders[0]?.currency ?? "TRY", lastSyncAt: user.lastSyncAt?.toISOString() ?? null, days, kpis, daily, storePerf, stock, insights, activity };
}
export type Dashboard = Awaited<ReturnType<typeof buildDashboard>>;
