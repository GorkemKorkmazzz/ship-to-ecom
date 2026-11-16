// Yerel test için sahte Google OAuth + Google Ads REST API. Gerçek Google hesabı olmadan bağlantı akışını denemeyi sağlar.
//   node scripts/mock-google.mjs
// Uygulama: GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret GOOGLE_AUTH_URL=http://localhost:4040/auth
//           GOOGLE_TOKEN_URL=http://localhost:4040/token GOOGLE_REVOKE_URL=http://localhost:4040/revoke GOOGLE_ADS_URL=http://localhost:4040/ads
// Modlar: curl -X POST "localhost:4040/_mod?iptal=1" (izin reddi) · "?gecersiz=1" (invalid_grant) · Durum: curl localhost:4040/_state
import http from "node:http";

const mode = { iptal: false, gecersiz: false, adminYok: false, kota: false, huniHata: false, urunHata: false };
const gaCalls = [];
const log = [];
const metricCalls = [];
let accessN = 0;
const valid = new Set();
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const CUSTOMERS = {
  "1112223333": { id: "1112223333", descriptiveName: "Doğrudan Hesap", currencyCode: "TRY", timeZone: "Europe/Istanbul", manager: false },
  "9998887777": { id: "9998887777", descriptiveName: "Ajans MCC", currencyCode: "TRY", timeZone: "Europe/Istanbul", manager: true },
};
const CLIENTS = [
  { id: "4445556666", descriptiveName: "Müşteri A", currencyCode: "TRY", timeZone: "Europe/Istanbul", manager: false, level: "1", hidden: false, status: "ENABLED" },
  { id: "1112223333", descriptiveName: "Doğrudan Hesap", currencyCode: "TRY", timeZone: "Europe/Istanbul", manager: false, level: "1", hidden: false, status: "ENABLED" },
  { id: "7776665555", descriptiveName: "Gizli Hesap", currencyCode: "USD", timeZone: "UTC", manager: false, level: "1", hidden: true, status: "ENABLED" },
  { id: "5554443333", descriptiveName: "Alt MCC", currencyCode: "TRY", timeZone: "Europe/Istanbul", manager: true, level: "1", hidden: false, status: "ENABLED" },
];

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:4040");
  let body = "";
  for await (const c of req) body += c;
  const json = (o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const q = url.searchParams;
  log.push(`${req.method} ${url.pathname}${req.headers["login-customer-id"] ? ` [login ${req.headers["login-customer-id"]}]` : ""}`);

  if (url.pathname === "/_mod") { for (const k of Object.keys(mode)) if (q.has(k)) mode[k] = q.get(k) === "1"; return json(mode); }
  if (url.pathname === "/_state") return json({ mode, log: log.slice(-40), metricCalls, gaCalls });
  if (url.pathname === "/auth") {
    const ok = q.get("client_id") === "test-client" && q.get("access_type") === "offline" && q.get("response_type") === "code" && /auth\/(adwords|analytics\.readonly)/.test(q.get("scope"));
    if (!ok) return json({ hata: "parametre", q: Object.fromEntries(q) }, 400);
    const back = new URL(q.get("redirect_uri"));
    if (mode.iptal) back.searchParams.set("error", "access_denied"); else { back.searchParams.set("code", "g-kod"); back.searchParams.set("state", q.get("state")); }
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (url.pathname === "/token") {
    const f = new URLSearchParams(body);
    if (f.get("client_secret") !== "test-secret") return json({ error: "invalid_client" }, 401);
    if (mode.gecersiz) return json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    const at = `g-access-${++accessN}`;
    valid.add(at);
    if (f.get("grant_type") === "authorization_code" && f.get("code") === "g-kod")
      return json({ access_token: at, expires_in: 3599, refresh_token: "g-refresh", token_type: "Bearer", id_token: `x.${b64({ sub: "g-user-1", email: "reklamci@ornek.test" })}.y` });
    if (f.get("grant_type") === "refresh_token" && f.get("refresh_token") === "g-refresh") return json({ access_token: at, expires_in: 3599, token_type: "Bearer" });
    return json({ error: "invalid_grant" }, 400);
  }
  if (url.pathname === "/revoke") return json({});
  if (url.pathname.startsWith("/ads/")) {
    const auth = (req.headers.authorization ?? "").replace("Bearer ", "");
    if (!valid.has(auth)) return json({ error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } }, 401);
    if (url.pathname === "/ads/customers:listAccessibleCustomers") {
      if (req.headers["login-customer-id"]) return json({ error: { code: 400, message: "login-customer-id must not be set" } }, 400);
      return json({ resourceNames: Object.keys(CUSTOMERS).map((id) => `customers/${id}`) });
    }
    const m = url.pathname.match(/^\/ads\/customers\/(\d+)\/googleAds:search$/);
    if (m && req.method === "POST") {
      const { query, page_token } = JSON.parse(body || "{}");
      // Erişim: hesabın kendisi ya da onu yöneten MCC login-customer-id olarak verilmeli.
      const login = req.headers["login-customer-id"];
      const viaMcc = login === "9998887777" && CLIENTS.some((c) => c.id === m[1]);
      if (login !== m[1] && !viaMcc) return json({ error: { code: 403, message: "User doesn't have permission to access customer." } }, 403);
      if (/FROM customer_client/.test(query)) {
        if (!CUSTOMERS[m[1]]?.manager) return json({ results: [] });
        const start = Number(page_token ?? 0), size = 2;
        return json({ results: CLIENTS.slice(start, start + size).map((c) => ({ customerClient: c })), ...(start + size < CLIENTS.length ? { nextPageToken: String(start + size) } : {}) });
      }
      if (/FROM customer\b/.test(query)) return json({ results: [{ customer: CUSTOMERS[m[1]] }] });
      const sp = query.match(/FROM shopping_performance_view WHERE segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
      if (sp) {
        // Ürün kırılımı (kampanya 501, son 3 gün): SKU, varyant kimliği (aynı ürün), ad-yalnız ve eşleşmeyen anahtar.
        if (mode.urunHata) return json({ error: { code: 400, message: "Unrecognized field in the query: 'segments.product_item_id'." } }, 400);
        const out = [];
        for (let d = 0; d < 3; d++) {
          const date = new Date(Date.parse(sp[2]) - d * 86400000).toISOString().slice(0, 10);
          for (const [id, title, cost, imp, clk, conv, val] of [["TS-001", "Basic Tişört", "20000000", "1000", "40", 2, 400], ["v2", "Basic Tişört - L", "10000000", "500", "20", 1, 200], ["SW-001", "Kapüşonlu Sweatshirt", "15000000", "800", "30", 0, 0], ["gmc-1", "Kapüşonlu Sweatshirt", "5000000", "200", "5", 0, 0], ["eski-99", "Silinmiş Ürün", "3000000", "100", "2", 0, 0]])
            out.push({ campaign: { id: "501" }, segments: { date, productItemId: id, productTitle: title }, metrics: { costMicros: cost, impressions: imp, clicks: clk, conversions: conv, conversionsValue: val } });
        }
        return json({ results: out });
      }
      const rng = query.match(/FROM campaign WHERE segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
      if (rng) {
        metricCalls.push({ customer: m[1], login: req.headers["login-customer-id"], since: rng[1], until: rng[2] });
        // Müşteri A'ya yalnızca MCC üzerinden erişilir
        if (m[1] === "4445556666" && req.headers["login-customer-id"] !== "9998887777") return json({ error: { code: 403, message: "login-customer-id required" } }, 403);
        const rows = [];
        for (let d = 0; d < 2; d++) {
          const date = new Date(Date.parse(rng[2]) - d * 86400000).toISOString().slice(0, 10);
          rows.push({ campaign: { resourceName: `customers/${m[1]}/campaigns/501`, id: "501", name: "Arama - Marka", status: "ENABLED", advertisingChannelType: "SEARCH" }, segments: { date },
            metrics: { costMicros: "125500000", impressions: "4000", clicks: "160", conversions: 3.5, conversionsValue: 2100.75 } });
          rows.push({ campaign: { resourceName: `customers/${m[1]}/campaigns/502`, id: "502", name: "Performance Max", status: "PAUSED", advertisingChannelType: "PERFORMANCE_MAX" }, segments: { date },
            metrics: { costMicros: "50000000", impressions: "9000", clicks: "90", conversions: 0, conversionsValue: 0 } });
        }
        const start = Number(page_token ?? 0), size = 3;
        return json({ results: rows.slice(start, start + size), ...(start + size < rows.length ? { nextPageToken: String(start + size) } : {}) });
      }
      // Bütçe sorgusu (metriksiz, gerçek API'de bütçe alanları metriklerle seçilemez)
      if (/campaign_budget\.amount_micros/.test(query) && /FROM campaign$/.test(query.trim())) {
        if (/metrics\./.test(query)) return json({ error: { code: 400, message: "budget fields cannot be selected with metrics" } }, 400);
        return json({ results: [
          { campaign: { id: "501" }, campaignBudget: { amountMicros: "300000000", period: "DAILY" } },
          { campaign: { id: "502" }, campaignBudget: { totalAmountMicros: "9000000000", period: "CUSTOM_PERIOD" } },
        ] });
      }
      // Reklam asset'leri (ad_group_ad_asset_view): metriksiz yapı + performans etiketi
      if (/FROM ad_group_ad_asset_view/.test(query)) {
        if (/metrics\.|segments\.date/.test(query)) return json({ error: { code: 400, message: "test: yapı sorgusu bekleniyor" } }, 400);
        const a = (ad, fieldType, label, asset) => ({ adGroupAd: { ad: { id: ad } }, adGroupAdAssetView: { fieldType, performanceLabel: label }, asset });
        return json({ results: [
          a("70011", "HEADLINE", "BEST", { id: "9001", type: "TEXT", textAsset: { text: "Marka Resmi Mağaza" } }),
          a("70011", "HEADLINE", "GOOD", { id: "9002", type: "TEXT", textAsset: { text: "Ücretsiz Kargo" } }),
          a("70011", "DESCRIPTION", "LOW", { id: "9003", type: "TEXT", textAsset: { text: "Yeni sezon ürünleri" } }),
          a("70021", "HEADLINE", "LEARNING", { id: "9004", type: "TEXT", textAsset: { text: "Kampanyalı Ürünler" } }),
        ] });
      }
      // Reklam grubu ve reklam düzeyi günlük metrikler
      const lv = query.match(/FROM (ad_group_ad|ad_group) WHERE segments\.date BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
      if (lv) {
        const rows = [];
        for (let d = 0; d < 2; d++) {
          const date = new Date(Date.parse(lv[3]) - d * 86400000).toISOString().slice(0, 10);
          for (const [g, gname, cost, clicks, conv, val] of [["7001", "Marka - Tam eşleme", "80000000", "100", 2.5, 1500.5], ["7002", "Marka - Geniş", "45500000", "60", 1, 600.25]]) {
            const base = { campaign: { id: "501" }, adGroup: { id: g, name: gname, status: "ENABLED" }, segments: { date } };
            if (lv[1] === "ad_group") rows.push({ ...base, metrics: { costMicros: cost, impressions: "2000", clicks, conversions: conv, conversionsValue: val } });
            else rows.push({ ...base, adGroupAd: { status: "ENABLED", ad: { id: `${g}1`, name: "", type: "RESPONSIVE_SEARCH_AD" } }, metrics: { costMicros: cost, impressions: "2000", clicks, conversions: conv, conversionsValue: val } });
          }
        }
        return json({ results: rows });
      }
      return json({ error: { code: 400, message: "unknown query" } }, 400);
    }
  }
  // ── GA4 ──
  if (url.pathname.startsWith("/ga4")) {
    const auth = (req.headers.authorization ?? "").replace("Bearer ", "");
    if (!valid.has(auth)) return json({ error: { code: 401, message: "invalid credentials", status: "UNAUTHENTICATED" } }, 401);
    if (url.pathname === "/ga4admin/accountSummaries") {
      if (mode.adminYok) return json({ error: { code: 403, message: "Google Analytics Admin API has not been used in project", status: "PERMISSION_DENIED" } }, 403);
      const page = q.get("pageToken");
      return json(page ? { accountSummaries: [{ account: "accounts/2", displayName: "Hesap B", propertySummaries: [{ property: "properties/222", displayName: "İkinci Site GA4" }] }] }
        : { accountSummaries: [{ account: "accounts/1", displayName: "Hesap A", propertySummaries: [{ property: "properties/111", displayName: "Ana Site GA4", propertyType: "PROPERTY_TYPE_ORDINARY" }] }], nextPageToken: "s2" });
    }
    const rr = url.pathname.match(/^\/ga4data\/properties\/(\d+):runReport$/);
    if (rr) {
      if (!["111", "222", "333"].includes(rr[1])) return json({ error: { code: 404, message: "Property not found", status: "NOT_FOUND" } }, 404);
      if (mode.kota) return json({ error: { code: 429, message: "Exhausted property tokens per day", status: "RESOURCE_EXHAUSTED" } }, 429);
      const b = JSON.parse(body || "{}");
      gaCalls.push({ property: rr[1], range: b.dateRanges?.[0], offset: b.offset, dims: (b.dimensions ?? []).map((d) => d.name), metrics: (b.metrics ?? []).map((m) => m.name) });
      if (!b.dimensions) return json({ rows: [{ metricValues: [{ value: "120" }] }], rowCount: 1, metadata: { currencyCode: "TRY", timeZone: "Europe/Istanbul" } });
      const end = Date.parse(b.dateRanges[0].endDate);
      if (b.dimensions.length === 5) {
        if (mode.huniHata) return json({ error: { code: 400, message: "Field itemViewEvents is not a valid metric", status: "INVALID_ARGUMENT" } }, 400);
        const out = [];
        for (let d = 0; d < 3; d++) {
          const date = new Date(end - d * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
          out.push({ dimensionValues: [date, "google", "cpc", "(not set)", "Arama - Marka"].map((value) => ({ value })), metricValues: ["50", "30", "8", "4", "2", "800"].map((value) => ({ value })) });
          out.push({ dimensionValues: [date, "facebook", "paid", "Kış İndirimi", "(not set)"].map((value) => ({ value })), metricValues: ["40", "25", "6", "3", "1", "600"].map((value) => ({ value })) });
        }
        return json({ rows: out, rowCount: out.length, metadata: { currencyCode: "TRY", timeZone: "Europe/Istanbul" } });
      }
      const rows = [];
      for (let d = 0; d < 3; d++) {
        const date = new Date(end - d * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
        rows.push({ dimensionValues: [{ value: date }, { value: "Organic Search" }], metricValues: ["100", "80", "5", "2", "1500.50"].map((value) => ({ value })) });
        rows.push({ dimensionValues: [{ value: date }, { value: "Paid Social" }], metricValues: ["40", "35", "1.5", "1", "600"].map((value) => ({ value })) });
      }
      const off = Number(b.offset ?? 0), lim = 4; // sayfalama denemesi
      return json({ rows: rows.slice(off, off + lim), rowCount: rows.length, metadata: { currencyCode: "TRY", timeZone: "Europe/Istanbul" } });
    }
  }
  return json({ error: { code: 404, message: `unknown ${url.pathname}` } }, 404);
}).listen(4040, () => console.log("sahte Google API: http://localhost:4040"));
