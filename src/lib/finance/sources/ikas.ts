// ikas siparişlerini motorun ortak biçimine dönüştürür. Pazaryerine özel kurallar burada kalır, motora girmez.
// Kalem durumu: CANCELLED → iptal, REFUNDED → iade. İade/iptal talepleri (…_REQUESTED) sonuçlanmadığı için satış sayılır.
import type { FinanceLine, FinanceOrder } from "../engine";

const CANCELLED_LINE = new Set(["CANCELLED"]);
const REFUNDED_LINE = new Set(["REFUNDED"]);
export const lineState = (status: string | null | undefined): FinanceLine["state"] =>
  status && CANCELLED_LINE.has(status) ? "cancelled" : status && REFUNDED_LINE.has(status) ? "refunded" : "active";

export type IkasOrderRow = {
  id: string; storeId: string; status: string; currency: string; totalFinalPrice: number; orderedAt: Date | null;
  totalPrice?: number | null; shippingTotal?: number | null; shippingTax?: number | null; finSyncedAt?: Date | null;
  lines: { sku: string; name: string; quantity: number; finalPrice: number | null; status: string | null; listPrice?: number | null; taxAmount?: number | null }[];
};
export type CostLookup = (storeId: string, sku: string) => { key: string; name: string | null; unitCost: number | null; costSource: string | null; estimateCost?: number | null };

export function fromIkas(o: IkasOrderRow, cost: CostLookup, refundPayments: number | null = null): FinanceOrder {
  return {
    id: o.id, storeId: o.storeId, source: "IKAS", currency: o.currency, status: o.status,
    draft: o.status === "DRAFT", cancelled: o.status === "CANCELLED",
    orderTotal: o.totalFinalPrice, orderedAt: o.orderedAt ?? new Date(0),
    // Finansal alanlar yalnızca finansal sorguyla senkronlanan siparişlerde güvenilirdir (finSyncedAt).
    linesNetTotal: o.finSyncedAt ? o.totalPrice ?? null : null, shippingIncome: o.finSyncedAt ? o.shippingTotal ?? null : null, shippingTax: o.finSyncedAt ? o.shippingTax ?? null : null,
    refundPayments,
    lines: o.lines.map((l) => {
      const k = cost(o.storeId, l.sku);
      return { key: k.key, sku: l.sku, name: l.name || k.name || k.key, quantity: l.quantity, unitPrice: l.finalPrice, state: lineState(l.status), unitCost: k.unitCost, costSource: k.costSource, estimateCost: k.estimateCost ?? null, listPrice: l.listPrice ?? null, taxAmount: l.taxAmount ?? null };
    }),
  };
}
