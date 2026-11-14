// Tükenmek Üzere: panel istatistikleri. Stok ve satışlar ikas'tan senkronlanan verilerdir (StoreVariant, Order/OrderLine).
import { db } from "../db";
import type { Scalar, Settings } from "./modules";

export const LOW_STOCK_MODULE = "tukenmek-uzere";

/**
 * - low: şu an uyarı eşiğinde olan (0 < stok <= eşik) hedef varyantlar.
 * - sales: hedeflenen ürünlerin son `days` gündeki satışı. Kategori hedeflemesinde ürün-kategori ilişkisi
 *   yerelde tutulmadığı için hesaplanmaz (null döner).
 */
export async function lowStockStats(storeId: string, s: Settings, days = 30) {
  const threshold = Number(s.threshold) || 0;
  const ids = (v: Scalar | undefined) => String(v ?? "").split(",").filter(Boolean);
  const scope = String(s.scope);
  const where = { storeId, ...(scope === "products" ? { productId: { in: ids(s.productIds as Scalar) } } : {}) };
  const variants = scope === "categories" ? [] : await db.storeVariant.findMany({ where, select: { sku: true, productName: true, currentStock: true } });
  const low = variants.filter((v) => v.currentStock > 0 && v.currentStock <= threshold).sort((a, b) => a.currentStock - b.currentStock);
  if (scope === "categories") return { low: null, sales: null };
  const skus = [...new Set(variants.map((v) => v.sku))];
  const since = new Date(Date.now() - days * 86_400_000);
  const lines = await db.orderLine.findMany({
    where: { sku: scope === "all" ? undefined : { in: skus }, order: { storeId, orderedAt: { gte: since }, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } } },
    select: { sku: true, quantity: true, finalPrice: true, order: { select: { currency: true } } },
  });
  const lowSkus = new Set(low.map((v) => v.sku));
  const sum = (ls: typeof lines) => ({ qty: ls.reduce((a, l) => a + l.quantity, 0), revenue: ls.reduce((a, l) => a + (l.finalPrice ?? 0) * l.quantity, 0) });
  return {
    low: low.slice(0, 20),
    sales: { ...sum(lines), lowNow: sum(lines.filter((l) => lowSkus.has(l.sku))), currency: lines[0]?.order.currency ?? "TRY" },
  };
}
