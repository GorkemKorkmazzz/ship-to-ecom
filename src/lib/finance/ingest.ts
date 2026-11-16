// Normalize edilmiş finansal kayıtların içe aktarımı. Her satış kanalı (ikas, pazaryerleri, elle giriş) kendi verisini
// bu biçime dönüştürür; pazaryerine özel mantık burada ya da motorda yoktur.
// Idempotency: (userId, source, externalId) tekil. Aynı kayıt tekrar gelirse değişmediyse yazılmaz, değiştiyse güncellenir.
// Tenant güvenliği: storeId ve orderId kullanıcıya ait değilse kayıt reddedilir.
import { db } from "../db";

import { validateTxn, type NormalizedReturn, type NormalizedTxn } from "./ingest-core";
export { SOURCES, TXN_TYPES, validateTxn, type NormalizedReturn, type NormalizedTxn, type TxnType } from "./ingest-core";

const same = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(b).every((k) => (a[k] instanceof Date && b[k] instanceof Date ? (a[k] as Date).getTime() === (b[k] as Date).getTime() : (a[k] ?? null) === (b[k] ?? null)));

async function ownedIds(userId: string, storeIds: (string | null | undefined)[], orderIds: (string | null | undefined)[]) {
  const s = [...new Set(storeIds.filter((x): x is string => !!x))], o = [...new Set(orderIds.filter((x): x is string => !!x))];
  const [stores, orders] = await Promise.all([
    s.length ? db.store.findMany({ where: { id: { in: s }, userId }, select: { id: true } }) : [],
    o.length ? db.order.findMany({ where: { id: { in: o }, store: { userId } }, select: { id: true } }) : [],
  ]);
  return { stores: new Set(stores.map((x) => x.id)), orders: new Set(orders.map((x) => x.id)) };
}

/** Finansal hareketleri içe aktarır. Dönüş: eklenen / güncellenen / değişmeyen / reddedilen sayıları. */
export async function ingestTransactions(userId: string, list: NormalizedTxn[]) {
  const res = { created: 0, updated: 0, unchanged: 0, rejected: [] as { externalId: string; reason: string }[] };
  const own = await ownedIds(userId, list.map((t) => t.storeId), list.map((t) => t.orderId));
  const ok: NormalizedTxn[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const err = validateTxn(t) ?? (t.storeId && !own.stores.has(t.storeId) ? "Mağaza bu kullanıcıya ait değil" : null) ?? (t.orderId && !own.orders.has(t.orderId) ? "Sipariş bu kullanıcıya ait değil" : null)
      ?? (seen.has(`${t.source}|${t.externalId}`) ? "Aynı listede tekrar eden kayıt" : null);
    if (err) res.rejected.push({ externalId: t.externalId, reason: err });
    else { ok.push(t); seen.add(`${t.source}|${t.externalId}`); }
  }
  if (!ok.length) return res;
  const existing = await db.financialTransaction.findMany({ where: { userId, OR: ok.map((t) => ({ source: t.source, externalId: t.externalId })) } });
  const exOf = new Map(existing.map((e) => [`${e.source}|${e.externalId}`, e]));
  const ops = [];
  for (const t of ok) {
    const data = {
      type: t.type, direction: t.direction, amount: t.amount, currency: t.currency, taxAmount: t.taxAmount ?? null, taxRate: t.taxRate ?? null, taxInclusive: t.taxInclusive ?? null,
      fxRate: t.fxRate ?? null, fxCurrency: t.fxCurrency ?? null, fxDate: t.fxDate ?? null, occurredAt: t.occurredAt, status: t.status ?? "POSTED",
      storeId: t.storeId ?? null, orderId: t.orderId ?? null, settlementId: t.settlementId ?? null, note: t.note ?? null, allocationMethod: t.allocationMethod ?? null,
    };
    const ex = exOf.get(`${t.source}|${t.externalId}`);
    if (!ex) { ops.push(db.financialTransaction.create({ data: { userId, source: t.source, externalId: t.externalId, ...data } })); res.created++; }
    else if (same(ex as unknown as Record<string, unknown>, data)) res.unchanged++;
    else { ops.push(db.financialTransaction.update({ where: { id: ex.id }, data })); res.updated++; }
  }
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  return res;
}

/** İade kayıtlarını içe aktarır (aynı iade tekrar gelirse yeni kayıt oluşmaz). */
export async function ingestReturns(userId: string, list: NormalizedReturn[]) {
  const res = { created: 0, updated: 0, unchanged: 0, rejected: [] as { externalId: string; reason: string }[] };
  const own = await ownedIds(userId, list.map((t) => t.storeId), list.map((t) => t.orderId));
  const seen = new Set<string>();
  const ok = list.filter((r) => {
    const dup = seen.has(`${r.source}|${r.externalId}`);
    seen.add(`${r.source}|${r.externalId}`);
    const err = dup ? "Aynı listede tekrar eden kayıt" : !r.externalId?.trim() ? "externalId gerekli" : !Number.isFinite(r.amount) || r.amount < 0 ? "Tutar geçersiz" : !/^[A-Z]{3}$/.test(r.currency) ? "Para birimi geçersiz"
      : r.storeId && !own.stores.has(r.storeId) ? "Mağaza bu kullanıcıya ait değil" : r.orderId && !own.orders.has(r.orderId) ? "Sipariş bu kullanıcıya ait değil" : null;
    if (err) res.rejected.push({ externalId: r.externalId, reason: err });
    return !err;
  });
  if (!ok.length) return res;
  const existing = await db.returnFinancial.findMany({ where: { userId, OR: ok.map((r) => ({ source: r.source, externalId: r.externalId })) } });
  const exOf = new Map(existing.map((e) => [`${e.source}|${e.externalId}`, e]));
  const ops = [];
  for (const r of ok) {
    const data = { amount: r.amount, currency: r.currency, taxAmount: r.taxAmount ?? null, includesShipping: r.includesShipping ?? null, reason: r.reason ?? null, refundedAt: r.refundedAt, status: r.status ?? "POSTED", storeId: r.storeId ?? null, orderId: r.orderId ?? null };
    const ex = exOf.get(`${r.source}|${r.externalId}`);
    if (!ex) { ops.push(db.returnFinancial.create({ data: { userId, source: r.source, externalId: r.externalId, ...data } })); res.created++; }
    else if (same(ex as unknown as Record<string, unknown>, data)) res.unchanged++;
    else { ops.push(db.returnFinancial.update({ where: { id: ex.id }, data })); res.updated++; }
  }
  for (let i = 0; i < ops.length; i += 200) await db.$transaction(ops.slice(i, i + 200));
  return res;
}
