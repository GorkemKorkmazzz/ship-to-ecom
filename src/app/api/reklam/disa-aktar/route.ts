import { hasModule } from "@/lib/access";
import { buildCampaignAnalysis } from "@/lib/ads/campaign";
import { CREATIVE_TYPES, buildCreativeReport } from "@/lib/ads/creatives";
import { PRODUCT_STATUS, buildProductReport } from "@/lib/ads/products";
import { FUNNEL_SOURCES, buildFunnel, type FunnelSource } from "@/lib/ads/funnel";
import { buildCampaignReport, parseAdRange } from "@/lib/ads/report";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

// Reklam raporları CSV dışa aktarma. Ekrandaki filtrelerin aynısı uygulanır; yalnızca oturumdaki kullanıcının verisi.
// UTF-8 BOM (Excel Türkçe karakterleri doğru açar), ";" ayırıcı, ondalık virgül, formül enjeksiyonu koruması.
const PROVIDER: Record<string, string> = { meta: "Meta", google: "Google Ads" };
const r2 = (v: number | null | undefined) => (v === null || v === undefined ? "" : Math.round(v * 100) / 100);

export async function GET(req: Request) {
  const userId = await getUserId();
  const user = userId ? await db.user.findUnique({ where: { id: userId } }) : null;
  if (!user || user.suspended) return new Response("Oturum gerekli", { status: 401 });
  if (!hasModule(user, "reklam")) return new Response("Paketiniz bu raporu kapsamıyor", { status: 403 });
  const q = new URL(req.url).searchParams;
  const range = parseAdRange(q.get("gun"), q.get("baslangic"), q.get("bitis"));
  const provider = q.get("platform") === "meta" || q.get("platform") === "google" ? q.get("platform") : null;
  let name = "reklam", head: string[] = [], rows: (string | number | null)[][] = [];
  const filters = `Dönem: ${range.from} – ${range.to}${provider ? ` · Platform: ${PROVIDER[provider]}` : ""}`;

  if (q.get("rapor") === "kampanyalar") {
    const site = q.get("site") ? await db.website.findFirst({ where: { id: q.get("site")!, userId: user.id }, select: { id: true } }) : null;
    const rep = await buildCampaignReport(user.id, range, site?.id ?? null, { provider, status: q.get("durum"), q: q.get("q"), sort: q.get("sirala"), dir: q.get("yon") });
    const camp = q.get("kampanya");
    const list = camp ? rep.rows.filter((r) => r.id === camp) : rep.rows;
    name = "kampanyalar";
    head = ["Kampanya", "Platform", "Hesap", "Durum", "Hedef", "Harcama", "Gösterim", "Tıklama", "CTR (%)", "CPC", "CPM", "Dönüşüm", "CPA", "Dönüşüm değeri (platform)", "ROAS", "Önceki dönem harcama", "Önceki dönem ROAS"];
    rows = list.map((r) => [r.name, PROVIDER[r.provider] ?? r.provider, r.account, r.status, r.objective, r2(r.spend), r.impressions, r.clicks, r2(r.ctr), r2(r.cpc), r2(r.cpm), r2(r.purchases), r2(r.purchases ? r.spend / r.purchases : null), r2(r.value), r2(r.roas), r2(r.prev?.spend), r2(r.prev?.roas)]);
  } else if (q.get("rapor") === "urunler") {
    const site = q.get("site") ? await db.website.findFirst({ where: { id: q.get("site")!, userId: user.id }, select: { id: true } }) : null;
    const platform = q.get("platform") === "google" ? "google" : "meta";
    const rep = await buildProductReport(user.id, range, { siteId: site?.id ?? null, platform, campaignId: q.get("kampanya"), category: q.get("kategori"), q: q.get("q"), sku: q.get("sku"), status: q.get("durum"), sort: q.get("sirala") });
    const conv = platform === "google";
    name = `urun-analizi-${platform}`;
    head = ["Ürün", "SKU", "Barkod", "Kategori", "Platform", "Eşleşme", "Harcama (platform)", "Gösterim", "Tıklama", "Ürün görüntüleme", "Sepete ekleme", "Platform dönüşümü", "Platform dönüşüm değeri", "Sipariş (ikas UTM)", "Adet (ikas UTM)", "Ciro (ikas UTM)", conv ? "ROAS (platform değeri / harcama)" : "ROAS (ikas UTM cirosu / harcama)", "CPA", "CTR (%)", "Dönüşüm oranı (%)", "Durum", "Demo"];
    const nv = (v: number | null) => (v === null ? "Veri yok" : r2(v));
    rows = rep.rows.map((r) => [r.name, r.skus.join(", "), r.barcode, r.category, PROVIDER[platform], r.matchedBy.join(", ") || "Reklam verisi yok", nv(r.spend), nv(r.impressions), nv(r.clicks), "Veri yok", "Veri yok",
      conv ? nv(r.conversions) : "Desteklenmiyor", conv ? nv(r.value) : "Desteklenmiyor", r.orders, r2(r.qty), r2(r.revenue), r2(r.roas), r2(r.cpa), r2(r.ctr), conv ? r2(r.convRate) : "Desteklenmiyor", PRODUCT_STATUS[r.status], rep.demo ? "DEMO" : ""]);
  } else if (q.get("rapor") === "huni") {
    const site = q.get("site") ? await db.website.findFirst({ where: { id: q.get("site")!, userId: user.id }, select: { id: true } }) : null;
    const source = (FUNNEL_SOURCES.find(([k]) => k === q.get("kaynak"))?.[0] ?? "meta") as FunnelSource;
    const f = await buildFunnel(user.id, range, site?.id ?? null, { source, campaignId: q.get("kampanya"), accountId: q.get("hesap"), traffic: q.get("trafik") });
    name = `huni-${source}`;
    const label = FUNNEL_SOURCES.find(([k]) => k === source)![1];
    head = ["Kaynak", "Bölüm", "Aşama / ad", "Değer", "Önceki aşamaya dönüşüm (%)", "Kayıp (%)", "Önceki dönem", "Değişim (%)", "Demo"];
    const demo = f.demo ? "DEMO" : "";
    const st = (part: string, list: typeof f.stages) => list.map((s) => [label, part, s.label, s.value === null ? "Veri yok" : r2(s.value), r2(s.rate), r2(s.drop), s.prev === null ? "Veri yok" : r2(s.prev), r2(s.change), demo]);
    rows = [...st("Huni", f.stages), ...f.segments.flatMap((g) => st(g.title, g.stages))];
    if (f.ikas) {
      const k = f.ikas;
      rows.push(...([["Tüm siparişler", k.all, k.allPrev], ["UTM'li siparişler", k.utm, k.utmPrev], ["Eşleşmeyen (UTM'siz)", k.unmatched, k.unmatchedPrev]] as const)
        .map(([n, a, b]) => [label, "Sipariş", n, a.orders, "", "", b.orders, "", demo]));
      // Kırılımlar: her ölçü ayrı satır (Bölüm sütunu ölçüyü adlandırır); gerçek ciro ikas sipariş tutarıdır.
      for (const [part, list] of [["UTM kampanyası", k.byCampaign], ["Kaynak / ortam", k.bySource]] as const)
        for (const c of list) rows.push([label, `${part} · sipariş`, c.name, c.orders, "", "", "", "", demo], [label, `${part} · gerçek ciro`, c.name, r2(c.revenue), "", "", "", "", demo], [label, `${part} · ort. sepet`, c.name, r2(c.aov), "", "", "", "", demo]);
    }
    if (f.ga4)
      for (const [part, list] of [["GA4 kaynak / ortam", f.ga4.bySource], ["GA4 kampanya", f.ga4.byCampaign]] as const)
        for (const x of list)
          for (const [m, v] of [["oturum", x.sessions], ["ürün görüntüleme", x.itemViews], ["sepete ekleme", x.carts], ["ödeme başlatma", x.checkouts], ["satın alma", x.purchases], ["oturum→satın alma (%)", x.convRate], ["gelir (GA4)", x.revenue]] as const)
            rows.push([label, `${part} · ${m}`, x.name, r2(v), "", "", "", "", demo]);
    if (f.byCampaign.length)
      for (const c of f.byCampaign)
        for (const [m, v] of [["harcama", r2(c.spend)], [source === "meta" ? "açılış sayfası" : "tıklama", c.visits ?? "Veri yok"], [source === "meta" ? "satın alma" : "dönüşüm", r2(c.purchases)], ["dönüşüm oranı (%)", r2(c.convRate)]] as const)
          rows.push([label, `Kampanya · ${m}`, c.name, v, "", "", "", "", demo]);
  } else if (q.get("rapor") === "kreatifler") {
    const site = q.get("site") ? await db.website.findFirst({ where: { id: q.get("site")!, userId: user.id }, select: { id: true } }) : null;
    const rep = await buildCreativeReport(user.id, range, { siteId: site?.id ?? null, provider, campaignId: q.get("kampanya"), adSetId: q.get("set"), type: q.get("tur"), sort: q.get("sirala") });
    name = "kreatifler";
    head = ["Reklam", "Kimlik", "Platform", "Kampanya", "Reklam seti / grubu", "Kreatif türü", "Durum", "Demo", "Harcama", "Gösterim", "Tıklama", "CTR (%)", "CPC", "CPM", "Dönüşüm", "CPA", "Dönüşüm değeri", "ROAS", "Önceki dönem harcama", "Önceki dönem ROAS"];
    rows = rep.rows.map((r) => [r.name, r.externalId, PROVIDER[r.provider] ?? r.provider, r.campaign.name, r.adSet.name, r.creativeType ? CREATIVE_TYPES[r.creativeType] ?? r.creativeType : "Veri yok", r.status, r.demo ? "DEMO" : "", r2(r.spend), r.impressions, r.clicks, r2(r.ctr), r2(r.cpc), r2(r.cpm), r2(r.purchases), r2(r.cpa), r2(r.value), r2(r.roas), r2(r.prev?.spend), r2(r.prev?.roas)]);
  } else if (q.get("rapor") === "kampanya") {
    const d = await buildCampaignAnalysis(user.id, q.get("id") ?? "", range);
    if (!d) return new Response("Kampanya bulunamadı", { status: 404 });
    const tablo = q.get("tablo");
    name = `kampanya-${d.campaign.externalId}-${tablo ?? "gunluk"}`;
    const reach = (x: { state: string; reach?: number | null }) => (x.state === "unsupported" ? "Desteklenmiyor" : x.state === "ok" && x.reach != null ? x.reach : "Veri yok");
    if (tablo === "setler") {
      head = [d.campaign.provider === "google" ? "Reklam grubu" : "Reklam seti", "Kimlik", "Durum", "Günlük bütçe", "Ömür boyu bütçe", "Harcama", "Gösterim", "Erişim (dönem)", "Tıklama", "CTR (%)", "CPC", "CPM", "Dönüşüm", "CPA", "Dönüşüm değeri", "ROAS"];
      rows = d.adsets.map((s) => [s.name, s.externalId, s.status, r2(s.dailyBudget), r2(s.lifetimeBudget), r2(s.spend), s.impressions, reach(s.reach), s.clicks, r2(s.ctr), r2(s.cpc), r2(s.cpm), r2(s.purchases), r2(s.cpa), r2(s.value), r2(s.roas)]);
    } else if (tablo === "reklamlar") {
      head = ["Reklam", "Kimlik", d.campaign.provider === "google" ? "Reklam grubu" : "Reklam seti", "Durum", "Tür", "Harcama", "Gösterim", "Erişim (dönem)", "Tıklama", "CTR (%)", "CPC", "CPM", "Dönüşüm", "CPA", "Dönüşüm değeri", "ROAS"];
      rows = d.ads.map((a) => [a.name, a.externalId, a.adSet, a.status, a.adType, r2(a.spend), a.impressions, reach(a.reach), a.clicks, r2(a.ctr), r2(a.cpc), r2(a.cpm), r2(a.purchases), r2(a.cpa), r2(a.value), r2(a.roas)]);
    } else {
      head = ["Tarih", "Durum", "Harcama", "Gösterim", "Tıklama", "Dönüşüm", "Dönüşüm değeri", "ROAS"];
      rows = d.daily.map((x) => (x.covered ? [x.date, "", r2(x.spend), x.impressions, x.clicks, r2(x.purchases), r2(x.value), r2(x.roas)] : [x.date, "Veri yok", "", "", "", "", "", ""]));
    }
  } else return new Response("Geçersiz rapor", { status: 400 });

  // Aktif filtreler dosyanın en üstünde tek satır olarak yazılır.
  const body = toCsv([filters], []).replace(/\r\n$/, "\r\n") + toCsv(head, rows, { safe: true }).replace(/^﻿/, "");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
