// Yerel test için sahte Meta Graph API ve onay ekranı. Gerçek Meta hesabı olmadan bağlantı akışını denemeyi sağlar.
//   node scripts/mock-meta.mjs
// Uygulama: META_APP_ID=test-app META_APP_SECRET=test-secret META_DIALOG_URL=http://localhost:4030/dialog/oauth META_GRAPH_URL=http://localhost:4030
// Onay ekranı kullanıcıyı hemen geri yollar; ?iptal=1 ile iptal benzetilir: curl -X POST localhost:4030/_mod?iptal=1
// Süresi dolmuş token: curl -X POST "localhost:4030/_mod?dolmus=1"   · Durum: curl localhost:4030/_state
import { createHmac } from "node:crypto";
import http from "node:http";

const APP = { id: "test-app", secret: "test-secret" };
const mode = { iptal: false, dolmus: false };
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
  if (url.pathname === "/me" ) return json({ id: "fb-user-1", name: "Test Reklamcı" });
  if (url.pathname === "/me/adaccounts") {
    // Sayfalama denemesi için her sayfada 1 hesap
    const after = Number(q.get("after") ?? 0);
    const next = after + 1 < accounts.length ? `http://localhost:4030/me/adaccounts?${new URLSearchParams({ ...Object.fromEntries(q), after: String(after + 1) })}` : undefined;
    return json({ data: accounts.slice(after, after + 1), paging: { cursors: { after: String(after + 1) }, ...(next ? { next } : {}) } });
  }
  if (req.method === "DELETE" && /\/permissions$/.test(url.pathname)) return json({ success: true });
  const camp = url.pathname.match(/^\/act_(\d+)\/campaigns$/);
  if (camp) return json({ data: camp[1] === "1001" ? [{ id: "c1", name: "Kış İndirimi", effective_status: "ACTIVE", objective: "OUTCOME_SALES" }, { id: "c2", name: "Yeniden Hedefleme", effective_status: "PAUSED", objective: "OUTCOME_SALES" }] : [] });
  const ins = url.pathname.match(/^\/act_(\d+)\/insights$/);
  if (ins) {
    if (q.get("level") !== "campaign" || q.get("time_increment") !== "1") return fail(100, "bad params");
    const tr = JSON.parse(q.get("time_range") ?? "{}");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tr.since) || !/^\d{4}-\d{2}-\d{2}$/.test(tr.until)) return fail(100, "bad time_range");
    insightCalls.push(tr);
    // Son 3 gün için iki kampanyanın günlük satırları (+ yalnızca metriklerde görünen silinmiş kampanya c9)
    const rows = [];
    for (let d = 0; d < 3; d++) {
      const date = new Date(Date.parse(tr.until) - d * 86400000).toISOString().slice(0, 10);
      rows.push({ campaign_id: "c1", campaign_name: "Kış İndirimi", date_start: date, date_stop: date, spend: "100.50", impressions: "10000", reach: "8000", clicks: "200", account_currency: "TRY",
        // Aynı satın alma iki eylem türünde raporlanır; yalnızca biri sayılmalı
        actions: [{ action_type: "link_click", value: "200" }, { action_type: "omni_purchase", value: "4" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "4" }],
        action_values: [{ action_type: "omni_purchase", value: "1200" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "1200" }] });
      rows.push({ campaign_id: "c9", campaign_name: "Silinmiş Kampanya", date_start: date, date_stop: date, spend: "20", impressions: "1500", reach: "1400", clicks: "15", account_currency: "TRY" });
    }
    const after = Number(q.get("after") ?? 0), size = 4;
    const next = after + size < rows.length ? `http://localhost:4030${url.pathname}?${new URLSearchParams({ ...Object.fromEntries(q), after: String(after + size) })}` : undefined;
    return json({ data: rows.slice(after, after + size), paging: next ? { next } : {} });
  }
  return fail(100, `unknown path ${url.pathname}`);
}).listen(4030, () => console.log("sahte Meta API: http://localhost:4030"));
