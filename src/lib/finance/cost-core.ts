// Maliyet geçmişinin saf işlevleri (veritabanı yok; testlerde doğrudan kullanılır).
export type CostEntry = { storeId: string; sku: string; unitCost: number; currency: string | null; validFrom: Date; validTo: Date | null; source: string };

/** Verilen andaki geçerli maliyet (saf). */
export function costAt(entries: CostEntry[], at: Date): CostEntry | null {
  let hit: CostEntry | null = null;
  for (const e of entries) if (e.validFrom <= at && (!e.validTo || at < e.validTo) && (!hit || e.validFrom > hit.validFrom)) hit = e;
  return hit;
}
/** Satışa uygulanabilir mi: maliyet para birimi bilinir ve satışınkiyle aynı olmalı. */
export const applicable = (e: CostEntry | null, saleCurrency: string) => !!e && e.currency === saleCurrency;

export function indexCosts(rows: CostEntry[]) {
  const m = new Map<string, CostEntry[]>();
  for (const r of rows) m.set(`${r.storeId}|${r.sku}`, [...(m.get(`${r.storeId}|${r.sku}`) ?? []), r]);
  return m;
}
/** Kalem için snapshot alanları: sipariş anındaki geçerli maliyet; yoksa boş (eksik). */
export function snapshotFor(costs: Map<string, CostEntry[]>, storeId: string, sku: string, orderedAt: Date | null, saleCurrency: string, now = new Date()) {
  const e = orderedAt ? costAt(costs.get(`${storeId}|${sku}`) ?? [], orderedAt) : null;
  return applicable(e, saleCurrency) ? { unitCost: e!.unitCost, costCurrency: e!.currency, costSource: e!.source, costCapturedAt: now } : { unitCost: null, costCurrency: null, costSource: null, costCapturedAt: null };
}
