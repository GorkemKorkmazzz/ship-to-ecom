import { db } from "../db";
import { syncGa4Metrics } from "./ga4";
import { syncGoogleMetrics } from "./google";
import { syncMetaMetrics } from "./meta";

/** Kullanıcının raporlamaya dahil ettiği tüm reklam hesaplarının verisini çeker. Bir hesabın hatası diğerlerini durdurmaz. */
export async function syncAllAds(userId: string, force = false) {
  // Demo bağlantılar (externalUserId "demo-...") hiçbir platforma istek göndermez.
  const accounts = await db.adAccount.findMany({ where: { selected: true, integration: { userId, status: "active", NOT: { externalUserId: { startsWith: "demo-" } } } }, select: { id: true, name: true, provider: true } });
  const errors: string[] = [];
  let rows = 0;
  for (const a of accounts) {
    try {
      rows += (a.provider === "google" ? await syncGoogleMetrics(a.id, userId, force) : await syncMetaMetrics(a.id, userId, force)).rows;
    } catch (e) {
      errors.push(`${a.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // GA4: yalnızca bir siteye atanmış mülkler çekilir.
  const props = await db.analyticsProperty.findMany({ where: { websiteId: { not: null }, integration: { userId, provider: "ga4", status: "active", NOT: { externalUserId: { startsWith: "demo-" } } } }, select: { id: true, name: true } });
  for (const p of props) {
    try {
      rows += (await syncGa4Metrics(p.id, userId, force)).rows;
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { accounts: accounts.length + props.length, rows, errors };
}
