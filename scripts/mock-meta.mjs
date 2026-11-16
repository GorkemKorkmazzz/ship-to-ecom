// Yerel test için sahte Meta Graph API ve onay ekranı. Gerçek Meta hesabı olmadan bağlantı akışını denemeyi sağlar.
//   node scripts/mock-meta.mjs
// Uygulama: META_APP_ID=test-app META_APP_SECRET=test-secret META_DIALOG_URL=http://localhost:4030/dialog/oauth META_GRAPH_URL=http://localhost:4030
// Onay ekranı kullanıcıyı hemen geri yollar; ?iptal=1 ile iptal benzetilir: curl -X POST localhost:4030/_mod?iptal=1
// Süresi dolmuş token: curl -X POST "localhost:4030/_mod?dolmus=1"   · Durum: curl localhost:4030/_state
import { createHmac } from "node:crypto";
import http from "node:http";

const APP = { id: "test-app", secret: "test-secret" };
const mode = { iptal: false, dolmus: false, seviyeHata: false, kota: false, kreatifHata: false, urunHata: false };
const accounts = [
  { id: "act_1001", account_id: "1001", name: "Ana Mağaza Reklamları", currency: "TRY", timezone_name: "Europe/Istanbul", account_status: 1 },
  { id: "act_1002", account_id: "1002", name: "Kampanya Hesabı", currency: "TRY", timezone_name: "Europe/Istanbul", account_status: 2 },
];
const log = [];
const insightCalls = [];

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost:4030");
  const q = url.searchParams;
  const json = (o, code = 200) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  const fail = (code, message, sub) => json({ error: { message, type: "OAuthException", code, error_subcode: sub } }, 400);
  log.push(`${req.method} ${url.pathname}`);

  // Kreatif küçük resimleri (sahte CDN). /_img/yok.png → 404 (süresi dolmuş adres benzetimi)
  if (url.pathname.startsWith("/_img/")) {
    if (url.pathname.endsWith("yok.png")) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="#6366f1"/><text x="20" y="380" font-size="40" fill="#fff">${url.pathname.slice(6)}</text></svg>`);
  }
  if (url.pathname === "/_mod") { for (const k of Object.keys(mode)) if (q.has(k)) mode[k] = q.get(k) === "1"; return json(mode); }
  if (url.pathname === "/_state") return json({ mode, log: log.slice(-30), insightCalls });
  if (url.pathname === "/dialog/oauth") {
    if (q.get("client_id") !== APP.id || q.get("scope") !== "ads_read") return json({ hata: "parametre", q: Object.fromEntries(q) }, 400);
    const back = new URL(q.get("redirect_uri"));
    if (mode.iptal) { back.searchParams.set("error_reason", "user_denied"); back.searchParams.set("error", "access_denied"); }
    else { back.searchParams.set("code", "kod-ok"); back.searchParams.set("state", q.get("state")); }
    res.writeHead(302, { Location: back.toString() }); return res.end();
  }
  if (url.pathname === "/oauth/access_token") {
    if (q.get("client_secret") !== APP.secret) return fail(1, "invalid client secret");
    if (q.get("grant_type") === "fb_exchange_token") return q.get("fb_exchange_token") === "kisa-token" ? json({ access_token: "uzun-token", token_type: "bearer", expires_in: 5183944 }) : fail(190, "bad token");
    return q.get("code") === "kod-ok" ? json({ access_token: "kisa-token", token_type: "bearer", expires_in: 3600 }) : fail(100, "Invalid verification code");
  }
  // Graph uçları: token ve appsecret_proof doğrulanır
  const token = q.get("access_token");
  if (mode.dolmus) return fail(190, "Error validating access token: Session has expired", 463);
  if (token !== "uzun-token") return fail(190, "Invalid OAuth access token", 467);
  if (q.get("appsecret_proof") !== createHmac("sha256", APP.secret).update(token).digest("hex")) return fail(100, "Invalid appsecret_proof provided in the API argument");
  // Hata modları: seviyeHata → reklam seti uç noktası hata verir; kota → insights istek sınırı (kod 17) döner.
  if (mode.seviyeHata && /\/adsets$/.test(url.pathname)) return fail(100, "(#100) Test: reklam seti uç noktası hatası");
  if (mode.kota && /\/insights$/.test(url.pathname)) { insightCalls.push({ kota: true }); return fail(17, "User request limit reached"); }
  if (url.pathname === "/me" ) return json({ id: "fb-user-1", name: "Test Reklamcı" });
  if (url.pathname === "/me/adaccounts") {
    // Sayfalama denemesi için her sayfada 1 hesap
    const after = Number(q.get("after") ?? 0);
    const next = after + 1 < accounts.length ? `http://localhost:4030/me/adaccounts?${new URLSearchParams({ ...Object.fromEntries(q), after: String(after + 1) })}` : undefined;
    return json({ data: accounts.slice(after, after + 1), paging: { cursors: { after: String(after + 1) }, ...(next ? { next } : {}) } });
  }
  if (req.method === "DELETE" && /\/permissions$/.test(url.pathname)) return json({ success: true });
  const camp = url.pathname.match(/^\/act_(\d+)\/campaigns$/);
  // c1: kampanya bütçesi (CBO, en küçük birim: 50000 kuruş = 500 TL); c2: bütçe reklam seti düzeyinde
  if (camp) return json({ data: camp[1] === "1001" ? [{ id: "c1", name: "Kış İndirimi", effective_status: "ACTIVE", objective: "OUTCOME_SALES", daily_budget: "50000" }, { id: "c2", name: "Yeniden Hedefleme", effective_status: "PAUSED", objective: "OUTCOME_SALES" }] : [] });
  if (/^\/act_1001\/adsets$/.test(url.pathname)) return json({ data: [
    { id: "s1", name: "Kış - Kadın 25-44", campaign_id: "c1", effective_status: "ACTIVE", optimization_goal: "OFFSITE_CONVERSIONS" },
    { id: "s2", name: "Kış - Erkek 25-44", campaign_id: "c1", effective_status: "ACTIVE", optimization_goal: "OFFSITE_CONVERSIONS" },
    { id: "s3", name: "Retargeting 30 gün", campaign_id: "c2", effective_status: "PAUSED", daily_budget: "15000", optimization_goal: "OFFSITE_CONVERSIONS" } ] });
  if (/^\/act_1002\/(adsets|ads)$/.test(url.pathname)) return json({ data: [] });
  if (/^\/act_1001\/ads$/.test(url.pathname)) return json({ data: [
    { id: "a1", name: "Kış - Video 15sn", adset_id: "s1", campaign_id: "c1", effective_status: "ACTIVE", creative: { id: "cr1" } },
    { id: "a2", name: "Kış - Karusel", adset_id: "s1", campaign_id: "c1", effective_status: "ACTIVE", creative: { id: "cr2" } },
    { id: "a3", name: "Kış - Tek görsel", adset_id: "s2", campaign_id: "c1", effective_status: "ACTIVE", creative: { id: "cr3" } } ] });
  // Çoklu kimlik okuma: /?ids=cr1,cr2&fields=... (kreatif ayrıntıları)
  if (url.pathname === "/" && q.has("ids")) {
    if (mode.kreatifHata) return fail(100, "(#100) Test: kreatif okunamadı");
    insightCalls.push({ creatives: q.get("ids"), w: q.get("thumbnail_width") });
    const all = {
      cr1: { id: "cr1", object_type: "VIDEO", video_id: "v-777", thumbnail_url: "http://localhost:4030/_img/cr1.png" },
      cr2: { id: "cr2", object_type: "SHARE", thumbnail_url: "http://localhost:4030/_img/yok.png", object_story_spec: { link_data: { child_attachments: [{}, {}, {}] } } },
      cr3: { id: "cr3", object_type: "PHOTO", image_url: "http://localhost:4030/_img/cr3-tam.png", thumbnail_url: "http://localhost:4030/_img/cr3.png" },
    };
    return json(Object.fromEntries(q.get("ids").split(",").filter((k) => all[k]).map((k) => [k, all[k]])));
  }
  // Dönem erişimi: /{campaign}/insights, time_increment YOK (tek satır)
  const cins = url.pathname.match(/^\/(c\d+)\/insights$/);
  if (cins) {
    if (q.has("time_increment")) return fail(100, "period reach must not use time_increment");
    insightCalls.push({ reach: cins[1], level: q.get("level") });
    if (cins[1] !== "c1") return json({ data: [] });
    if (q.get("level") === "campaign") return json({ data: [{ reach: "15000", frequency: "2.0" }] });
    if (q.get("level") === "adset") return json({ data: [{ adset_id: "s1", reach: "9000", frequency: "1.9" }, { adset_id: "s2", reach: "7000", frequency: "1.6" }] });
    if (q.get("level") === "ad") return json({ data: [{ ad_id: "a1", reach: "6000", frequency: "1.5" }, { ad_id: "a2", reach: "3500", frequency: "1.4" }, { ad_id: "a3", reach: "7000", frequency: "1.6" }] });
  }
  const ins = url.pathname.match(/^\/act_(\d+)\/insights$/);
  if (ins) {
    if (!["campaign", "adset", "ad"].includes(q.get("level")) || q.get("time_increment") !== "1") return fail(100, "bad params");
    if (q.get("breakdowns") === "product_id") {
      // Ürün kırılımı: yalnızca site içi metrikler (Meta site dışı dönüşümlerde kırılım değeri vermez).
      if (mode.urunHata) return fail(100, "(#100) breakdowns product_id is not supported for this account");
      const tr0 = JSON.parse(q.get("time_range") ?? "{}"), out = [];
      if (ins[1] !== "1001") return json({ data: [] });
      for (let d = 0; d < 3; d++) {
        const date = new Date(Date.parse(tr0.until) - d * 86400000).toISOString().slice(0, 10);
        for (const [pid, sp, imp, clk] of [["p2", "30.00", "3000", "60"], ["p3", "10.00", "1000", "15"], ["yok-55", "5.00", "500", "4"]])
          out.push({ campaign_id: "c1", date_start: date, date_stop: date, product_id: pid, spend: sp, impressions: imp, inline_link_clicks: clk });
      }
      return json({ data: out });
    }
    if (q.get("level") !== "campaign") {
      // Reklam seti / reklam günlük satırları (c1'in son 3 günü). Toplamları kampanya satırına eşittir.
      const tr0 = JSON.parse(q.get("time_range") ?? "{}"), out = [];
      if (ins[1] !== "1001") return json({ data: [] });
      for (let d = 0; d < 3; d++) {
        const date = new Date(Date.parse(tr0.until) - d * 86400000).toISOString().slice(0, 10);
        const parts = q.get("level") === "adset"
          ? [{ adset_id: "s1", adset_name: "Kış - Kadın 25-44", spend: "60.30", impressions: "6000", clicks: "130", p: "3", v: "900" }, { adset_id: "s2", adset_name: "Kış - Erkek 25-44", spend: "40.20", impressions: "4000", clicks: "70", p: "1", v: "300" }]
          : [{ ad_id: "a1", ad_name: "Kış - Video 15sn", adset_id: "s1", spend: "40.30", impressions: "4000", clicks: "90", p: "2", v: "600" }, { ad_id: "a2", ad_name: "Kış - Karusel", adset_id: "s1", spend: "20", impressions: "2000", clicks: "40", p: "1", v: "300" }, { ad_id: "a3", ad_name: "Kış - Tek görsel", adset_id: "s2", spend: "40.20", impressions: "4000", clicks: "70", p: "1", v: "300" }];
        for (const x of parts) out.push({ ...x, campaign_id: "c1", date_start: date, actions: [{ action_type: "omni_purchase", value: x.p }], action_values: [{ action_type: "omni_purchase", value: x.v }] });
      }
      return json({ data: out });
    }
    const tr = JSON.parse(q.get("time_range") ?? "{}");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tr.since) || !/^\d{4}-\d{2}-\d{2}$/.test(tr.until)) return fail(100, "bad time_range");
    insightCalls.push(tr);
    // Son 3 gün için iki kampanyanın günlük satırları (+ yalnızca metriklerde görünen silinmiş kampanya c9)
    const rows = [];
    for (let d = 0; d < 3; d++) {
      const date = new Date(Date.parse(tr.until) - d * 86400000).toISOString().slice(0, 10);
      rows.push({ campaign_id: "c1", campaign_name: "Kış İndirimi", date_start: date, date_stop: date, spend: "100.50", impressions: "10000", reach: "8000", clicks: "200", account_currency: "TRY",
        // Aynı satın alma iki eylem türünde raporlanır; yalnızca biri sayılmalı
        inline_link_clicks: "150",
        // Huni: omni_ ve piksel türü aynı eylemi iki kez raporlar; yalnızca omni_ sayılmalı (ör. sepet 30, 60 değil).
        actions: [{ action_type: "link_click", value: "200" }, { action_type: "landing_page_view", value: "120" }, { action_type: "omni_view_content", value: "100" }, { action_type: "offsite_conversion.fb_pixel_view_content", value: "100" },
          { action_type: "omni_add_to_cart", value: "30" }, { action_type: "offsite_conversion.fb_pixel_add_to_cart", value: "30" }, { action_type: "offsite_conversion.fb_pixel_initiate_checkout", value: "10" },
          { action_type: "omni_purchase", value: "4" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" }],
        action_values: [{ action_type: "omni_purchase", value: "1200" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "1200" }] });
      rows.push({ campaign_id: "c9", campaign_name: "Silinmiş Kampanya", date_start: date, date_stop: date, spend: "20", impressions: "1500", reach: "1400", clicks: "15", account_currency: "TRY" });
    }
    const after = Number(q.get("after") ?? 0), size = 4;
    const next = after + size < rows.length ? `http://localhost:4030${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(q), after: String(after + size) })}` : undefined;
    return json({ data: rows.slice(after, after + size), paging: next ? { next } : {} });
  }
  return fail(100, `unknown path ${url.pathname}`);
}).listen(4030, () => console.log("sahte Meta API: http://localhost:4030"));
