// Ürün düzeyi reklam senkronu. Kampanya ve düzey senkronundan sonra ayrı adım; hata verirse diğer veriler etkilenmez.
// Belgeyle doğrulananlar:
//  - Google Ads: shopping_performance_view "Shopping campaign and Performance Max campaign statistics aggregated at several
//    product dimension levels"; segments.product_item_id, segments.product_title, metrics.cost_micros/impressions/clicks/
//    conversions/conversions_value. Google: bu görünümün gösterim/tıklama sayısı kampanya raporundan farklı olabilir.
//  - Meta: insights breakdowns=product_id ("The ID of the product involved in impression, click, or action").
//    Site dışı (off-Meta, piksel) eylemler bu kırılımla gelir ama kırılım değeri içermez: ürün başına satın alma alınamaz.
//    Bu nedenle Meta'dan yalnızca harcama, gösterim ve bağlantı tıklaması alınır; dönüşüm alanları null (desteklenmiyor).
// Belgede netleşmeyenler (gerçek hesapla doğrulanmalı): Meta product_id değerinin biçimi; spend alanının bu kırılımla dönmesi.
import type { AdAccount, AdIntegration } from "@prisma/client";
import { db } from "../db";
import { search } from "./google";
import { graph } from "./meta";

type Acc = AdAccount & { integration: AdIntegration };
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const campaignMap = async (adAccountId: string) => new Map((await db.adCampaign.findMany({ where: { adAccountId }, select: { id: true, externalId: true } })).map((c) => [c.externalId, c.id]));
type Row = { campaignId: string; date: string; productKey: string; productTitle: string | null; spend: number | null; impressions: number; clicks: number; conversions: number | null; conversionValue: number | null };

/** Aralıktaki satırları yeniden yazar (idempotent; platformda artık görünmeyen ürün satırı kalmaz). Aynı anahtar birleştirilir. */
async function save(acc: Acc, range: { since: string; until: string }, rows: Row[]) {
  const merged = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.campaignId}|${r.date}|${r.productKey}`;
    const m = merged.get(k);
    if (!m) { merged.set(k, { ...r }); continue; }
    m.impressions += r.impressions; m.clicks += r.clicks;
    m.spend = m.spend === null || r.spend === null ? m.spend ?? r.spend : m.spend + r.spend;
    m.conversions = m.conversions === null || r.conversions === null ? null : m.conversions + r.conversions;
    m.conversionValue = m.conversionValue === null || r.conversionValue === null ? null : m.conversionValue + r.conversionValue;
  }
  await db.$transaction([
    db.adProductDaily.deleteMany({ where: { adAccountId: acc.id, date: { gte: range.since, lte: range.until } } }),
    db.adProductDaily.createMany({ data: [...merged.values()].map((r) => ({ adAccountId: acc.id, ...r })) }),
  ]);
  return merged.size;
}

export async function syncGoogleProducts(acc: Acc, range: { since: string; until: string }) {
  const campaigns = await campaignMap(acc.id);
  type G = { campaign?: { id?: string }; segments?: { date?: string; productItemId?: string; productTitle?: string }; metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string } };
  const rows = await search<G>(acc.integration, acc.externalId,
    `SELECT campaign.id, segments.product_item_id, segments.product_title, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM shopping_performance_view WHERE segments.date BETWEEN '${range.since}' AND '${range.until}'`,
    acc.managerId ?? acc.externalId);
  const out: Row[] = [];
  for (const r of rows) {
    const campaignId = r.campaign?.id && campaigns.get(r.campaign.id);
    const key = r.segments?.productItemId?.trim();
    if (!campaignId || !key || !r.segments?.date) continue;
    out.push({ campaignId, date: r.segments.date, productKey: key, productTitle: r.segments.productTitle ?? null, spend: Math.round((n(r.metrics?.costMicros) / 1e6) * 100) / 100,
      impressions: Math.round(n(r.metrics?.impressions)), clicks: Math.round(n(r.metrics?.clicks)), conversions: n(r.metrics?.conversions), conversionValue: n(r.metrics?.conversionsValue) });
  }
  return save(acc, range, out);
}

export async function syncMetaProducts(acc: Acc, token: string, range: { since: string; until: string }) {
  const campaigns = await campaignMap(acc.id);
  type M = { campaign_id?: string; date_start?: string; product_id?: string; spend?: string; impressions?: string; inline_link_clicks?: string };
  let page = await graph<{ data: M[]; paging?: { next?: string } }>(`/act_${acc.externalId}/insights`, {
    level: "campaign", breakdowns: "product_id", time_increment: "1", limit: "500", time_range: JSON.stringify(range),
    fields: "campaign_id,spend,impressions,inline_link_clicks",
  }, token);
  const out: Row[] = [];
  for (let i = 0; i < 200; i++) {
    for (const r of page.data) {
      const campaignId = r.campaign_id && campaigns.get(r.campaign_id);
      const key = r.product_id?.trim();
      if (!campaignId || !key || !r.date_start) continue;
      out.push({ campaignId, date: r.date_start, productKey: key, productTitle: null, spend: r.spend === undefined ? null : n(r.spend),
        impressions: Math.round(n(r.impressions)), clicks: Math.round(n(r.inline_link_clicks)), conversions: null, conversionValue: null });
    }
    if (!page.paging?.next) break;
    page = await graph(page.paging.next, {});
  }
  return save(acc, range, out);
}

/** Ürün senkronu adımı: başarıda productSyncedAt, hatada productError + Kayıtlar. */
export async function runProductSync(acc: Acc, userId: string, job: () => Promise<number>) {
  try {
    await job();
    await db.adAccount.update({ where: { id: acc.id }, data: { productSyncedAt: new Date(), productError: null } });
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.adAccount.update({ where: { id: acc.id }, data: { productError: message } });
    await db.syncLog.create({ data: { userId, level: "warn", message: `${acc.name}: ürün düzeyi reklam verisi alınamadı (kampanya verisi etkilenmedi): ${message}`.slice(0, 900) } });
  }
}
