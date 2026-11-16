import { parseAdRange } from "@/lib/ads/report";
import { buildFinanceDashboard } from "@/lib/finance/dashboard";
import type { FinParams } from "./shell";

/** Finans alt sayfalarının ortak yüklemesi: aynı filtreler, aynı servis. */
export async function loadFinance(userId: string, sp: FinParams) {
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const d = await buildFinanceDashboard(userId, range, { storeId: sp.magaza, channel: sp.kanal, currency: sp.para, compare: sp.karsilastir !== "0" });
  return { range, d };
}
