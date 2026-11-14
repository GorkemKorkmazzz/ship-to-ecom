import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { googleApp } from "@/lib/ads/google";
import { META_ACCOUNT_STATUS, metaApp } from "@/lib/ads/meta";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ConfirmButton } from "../siparisler/bulk";
import { Flash, PageHeader, fmtDate } from "../ui";
import { addProperty, disconnect, refreshAccounts, refreshMetrics, saveAccount, saveProperty } from "./actions";

const STATUS: Record<string, [string, string]> = { active: ["Bağlı", "bg-emerald-100 text-emerald-700"], expired: ["Süresi doldu", "bg-red-100 text-red-700"], revoked: ["Yetki kaldırıldı", "bg-red-100 text-red-700"], error: ["Hata", "bg-red-100 text-red-700"] };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "meta")) return <Locked moduleId="meta" />;
  const sp = await searchParams;
  const [integrations, sites] = await Promise.all([
    db.adIntegration.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      // Token alanları sayfaya hiç alınmaz.
      select: { id: true, provider: true, displayName: true, status: true, lastError: true, tokenExpiresAt: true, lastSyncAt: true, accounts: { orderBy: { name: "asc" }, include: { websites: true } }, properties: { orderBy: { name: "asc" } } },
    }),
    db.website.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, domain: true } }),
  ]);
  const since = new Date(new Date().getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const meta = integrations.filter((i) => i.provider === "meta");
  const google = integrations.filter((i) => i.provider === "google");
  const ga4 = integrations.filter((i) => i.provider === "ga4");
  // GA4 son 30 gün: kanal kırılımı. Kullanıcı sayısı günler/kanallar arasında toplanamadığı için gösterilmez.
  const gaRows = await db.analyticsDaily.groupBy({
    by: ["propertyId", "channel"],
    where: { date: { gte: since }, property: { integration: { userId: user.id } } },
    _sum: { sessions: true, keyEvents: true, purchases: true, revenue: true },
  });
  const googleOpen = !!googleApp();
  // Son 30 günün özeti (oranlar toplamlardan hesaplanır). Erişim günler arasında toplanamadığı için gösterilmez.
  const sums = await db.adDailyMetric.groupBy({
    by: ["adAccountId"],
    where: { date: { gte: since }, adAccount: { integration: { userId: user.id } } },
    _sum: { spend: true, impressions: true, clicks: true, purchases: true, purchaseValue: true },
  });
  const sumOf = new Map(sums.map((s) => [s.adAccountId, s._sum]));
  const fmtN = (v: number, d = 0) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
  const money = (v: number, cur: string | null) => {
    try {
      return new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur ?? "TRY" }).format(v);
    } catch {
      return `${fmtN(v, 2)} ${cur ?? ""}`;
    }
  };
  const metaOpen = !!metaApp();
  const soon = (d: Date | null) => !!d && d.getTime() - new Date().getTime() < 7 * 86400000;


  type Integration = (typeof integrations)[number];
  const renderIntegration = (i: Integration, open: boolean, connectHref: string) => {
          const [label, cls] = STATUS[i.status] ?? [i.status, "bg-gray-100 text-gray-600"];
          return (
            <div key={i.id} className="mt-5 rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.displayName ?? (i.provider === "google" ? "Google kullanıcısı" : "Meta kullanıcısı")}</span><span className={`badge ${cls}`}>{label}</span>{i.status === "active" && soon(i.tokenExpiresAt) && <span className="badge bg-amber-100 text-amber-800">Yakında yeniden bağlanmalı</span>}</div>
                  <div className="text-xs text-gray-500">Yetki bitişi: {fmtDate(i.tokenExpiresAt)} · son yenileme: {fmtDate(i.lastSyncAt)}</div>
                  {i.lastError && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{i.lastError}</p>}
                </div>
                <div className="flex gap-2">
                  {i.status !== "active" && open && <a href={connectHref} className="btn-ghost">Yeniden bağlan</a>}
                  <form action={refreshAccounts}><input type="hidden" name="id" value={i.id} /><button className="btn-ghost">Hesapları yenile</button></form>
                  <form action={disconnect}><input type="hidden" name="id" value={i.id} /><ConfirmButton message={`${i.provider === "google" ? "Google Ads" : "Meta"} bağlantısı kaldırılsın mı? Reklam hesapları, verileri ve site eşleştirmeleri silinir.`}>Kaldır</ConfirmButton></form>
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {i.accounts.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <form action={saveAccount} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <input type="hidden" name="id" value={a.id} />
                      <label className="flex min-w-0 flex-1 items-center gap-3">
                        <input type="checkbox" name="selected" defaultChecked={a.selected} className="h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{a.name}</span>
                          <span className="block text-xs text-gray-500">{i.provider === "google" ? `${a.externalId.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3")}${a.managerId ? ` · MCC ${a.managerId.replace(/(\d{3})(\d{3})(\d+)/, "$1-$2-$3")}` : ""}` : `act_${a.externalId}`} · {a.currency ?? "—"} · {a.timezone ?? "—"}{a.remoteStatus !== null && a.remoteStatus !== 1 ? ` · ${META_ACCOUNT_STATUS[a.remoteStatus] ?? `durum ${a.remoteStatus}`}` : ""}</span>
                        </span>
                      </label>
                      <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        <legend className="sr-only">{a.name} için siteler</legend>
                        {sites.map((s) => (
                          <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" name="websiteIds" value={s.id} defaultChecked={a.websites.some((w) => w.websiteId === s.id)} />{s.name}</label>
                        ))}
                        {!sites.length && <Link href="/siteler" className="text-indigo-700 hover:underline">Önce site ekleyin</Link>}
                      </fieldset>
                      <button className="btn-ghost">Kaydet</button>
                    </form>
                    {a.selected && (() => {
                      const s = sumOf.get(a.id);
                      const spend = s?.spend ?? 0, imp = s?.impressions ?? 0, clk = s?.clicks ?? 0, pur = s?.purchases ?? 0, val = s?.purchaseValue ?? 0;
                      const cells: [string, string][] = [
                        ["Harcama", money(spend, a.currency)], ["Gösterim", fmtN(imp)], ["Tıklama", fmtN(clk)],
                        ["CTR", imp ? `%${fmtN((clk / imp) * 100, 2)}` : "—"], ["CPC", clk ? money(spend / clk, a.currency) : "—"], ["CPM", imp ? money((spend / imp) * 1000, a.currency) : "—"],
                        [i.provider === "google" ? "Dönüşüm" : "Satın alma", fmtN(pur, i.provider === "google" ? 1 : 0)], ["Dönüşüm değeri", money(val, a.currency)], ["ROAS", spend ? fmtN(val / spend, 2) : "—"],
                      ];
                      return (
                        <div className="mt-3 rounded-lg bg-gray-50 p-3">
                          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                            <span>Son 30 gün · {i.provider === "google" ? "Google Ads" : "Meta"}&apos;ın raporladığı değerler</span>
                            <span>{a.metricsSyncedAt ? `Güncellendi: ${fmtDate(a.metricsSyncedAt)}` : "Henüz veri çekilmedi"}</span>
                          </div>
                          {a.metricsError && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{a.metricsError}</p>}
                          <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-5 lg:grid-cols-9">
                            {cells.map(([k, v]) => <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}
                          </dl>
                        </div>
                      );
                    })()}
                  </li>
                ))}
                {!i.accounts.length && <li className="px-4 py-6 text-center text-sm text-gray-500">Bu kullanıcının erişebildiği reklam hesabı yok.</li>}
              </ul>
            </div>
          );
  };

  return (
    <>
      <PageHeader title="Reklam hesapları" desc="Meta ve Google Ads hesaplarınızı bağlayın, raporlamak istediklerinizi seçin ve web sitelerine atayın.">
        {integrations.some((i) => i.accounts.some((a) => a.selected) || i.properties.some((p) => p.websiteId)) && <form action={refreshMetrics}><button className="btn-ghost">Verileri şimdi güncelle</button></form>}
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />

      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 text-sm font-bold text-blue-600">Meta</span>
            <div>
              <h2 className="text-lg font-semibold">Meta Ads</h2>
              <p className="text-sm text-gray-500">Facebook ve Instagram reklam hesapları · yalnızca okuma izni (ads_read)</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {metaOpen ? <a href="/api/meta/baglan" className="btn">{meta.length ? "+ Başka Meta hesabı bağla" : "Meta ile bağlan"}</a> : <span className="badge bg-gray-100 text-gray-600">Yapılandırma bekliyor</span>}
          </div>
        </div>
        {!metaOpen && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Meta bağlantısı henüz açık değil. Sunucuda <code>META_APP_ID</code>, <code>META_APP_SECRET</code> ve https bir <code>APP_URL</code> tanımlanmalı; Meta uygulamasına yönlendirme adresi olarak <code>{"<APP_URL>"}/api/meta/callback</code> eklenmeli.
          </p>
        )}

        {meta.map((i) => renderIntegration(i, metaOpen, "/api/meta/baglan"))}
      </section>

      <section className="card mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 text-xs font-bold text-amber-600">Google</span>
            <div>
              <h2 className="text-lg font-semibold">Google Ads</h2>
              <p className="text-sm text-gray-500">Doğrudan ve yönetici (MCC) hesabı altındaki reklam hesapları</p>
            </div>
          </div>
          {googleOpen ? <a href="/api/google/baglan" className="btn">{google.length ? "+ Başka Google hesabı bağla" : "Google ile bağlan"}</a> : <span className="badge bg-gray-100 text-gray-600">Yapılandırma bekliyor</span>}
        </div>
        {!googleOpen && (
          <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Google Ads bağlantısı henüz açık değil. Sunucuda <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code> ve https bir <code>APP_URL</code> tanımlanmalı; Google Cloud OAuth istemcisine yönlendirme adresi olarak <code>{"<APP_URL>"}/api/google/callback</code> eklenmeli ve projenin Google Ads API erişimi onaylanmalı.
          </p>
        )}
        {google.map((i) => renderIntegration(i, googleOpen, "/api/google/baglan"))}
      </section>

      <section className="card mt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 text-xs font-bold text-orange-600">GA4</span>
            <div>
              <h2 className="text-lg font-semibold">Google Analytics 4</h2>
              <p className="text-sm text-gray-500">Site trafiği, kanal kırılımı ve GA4&apos;ün ölçtüğü gelir · yalnızca okuma izni</p>
            </div>
          </div>
          {googleOpen ? <a href="/api/ga4/baglan" className="btn">{ga4.length ? "+ Başka Google hesabı bağla" : "Google Analytics ile bağlan"}</a> : <span className="badge bg-gray-100 text-gray-600">Yapılandırma bekliyor</span>}
        </div>
        {!googleOpen && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Google Ads ile aynı OAuth istemcisi kullanılır; ayrıca yönlendirme adresi olarak <code>{"<APP_URL>"}/api/ga4/callback</code> eklenmeli ve Cloud projesinde Google Analytics Data API ile Admin API açılmalı.</p>}
        {ga4.map((i) => {
          const [label, cls] = STATUS[i.status] ?? [i.status, "bg-gray-100 text-gray-600"];
          return (
            <div key={i.id} className="mt-5 rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i.displayName ?? "Google kullanıcısı"}</span><span className={`badge ${cls}`}>{label}</span></div>
                  <div className="text-xs text-gray-500">Son mülk listesi: {fmtDate(i.lastSyncAt)}</div>
                  {i.lastError && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{i.lastError}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {i.status !== "active" && googleOpen && <a href="/api/ga4/baglan" className="btn-ghost">Yeniden bağlan</a>}
                  <form action={refreshAccounts}><input type="hidden" name="id" value={i.id} /><button className="btn-ghost">Mülkleri yenile</button></form>
                  <form action={disconnect}><input type="hidden" name="id" value={i.id} /><ConfirmButton message="Google Analytics bağlantısı kaldırılsın mı? Mülkler ve trafik verileri silinir.">Kaldır</ConfirmButton></form>
                </div>
              </div>
              <ul className="divide-y divide-gray-100">
                {i.properties.map((p) => {
                  const rows = gaRows.filter((r) => r.propertyId === p.id).sort((a, b) => (b._sum.sessions ?? 0) - (a._sum.sessions ?? 0));
                  const sum = (k: "sessions" | "keyEvents" | "purchases" | "revenue") => rows.reduce((a, r) => a + (r._sum[k] ?? 0), 0);
                  const sessions = sum("sessions");
                  return (
                    <li key={p.id} className="px-4 py-3">
                      <form action={saveProperty} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <input type="hidden" name="id" value={p.id} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block text-xs text-gray-500">properties/{p.propertyId}{p.accountName ? ` · ${p.accountName}` : ""}{p.currency ? ` · ${p.currency}` : ""}{p.timezone ? ` · ${p.timezone}` : ""}</span>
                        </span>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="text-gray-500">Site</span>
                          <select className="input py-1.5" name="websiteId" defaultValue={p.websiteId ?? ""}>
                            <option value="">Atanmamış</option>
                            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </label>
                        <button className="btn-ghost">Kaydet</button>
                      </form>
                      {p.websiteId && (
                        <div className="mt-3 rounded-lg bg-gray-50 p-3">
                          <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-gray-500">
                            <span>Son 30 gün · GA4&apos;ün ölçtüğü değerler</span>
                            <span>{p.metricsSyncedAt ? `Güncellendi: ${fmtDate(p.metricsSyncedAt)}` : "Henüz veri çekilmedi"}</span>
                          </div>
                          {p.metricsError && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{p.metricsError}</p>}
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
                            {([["Oturum", fmtN(sessions)], ["Önemli etkinlik", fmtN(sum("keyEvents"), 1)], ["Satın alma", fmtN(sum("purchases"))], ["Gelir", money(sum("revenue"), p.currency)], ["Oturum başı gelir", sessions ? money(sum("revenue") / sessions, p.currency) : "—"]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-gray-500">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}
                          </dl>
                          {rows.length > 0 && (
                            <div className="mt-3 space-y-1">
                              {rows.slice(0, 6).map((r) => (
                                <div key={r.channel} className="flex items-center gap-2 text-xs">
                                  <span className="w-36 shrink-0 truncate text-gray-600">{r.channel}</span>
                                  <span className="h-1.5 flex-1 rounded-full bg-gray-200"><span className="block h-1.5 rounded-full bg-orange-400" style={{ width: `${sessions ? ((r._sum.sessions ?? 0) / sessions) * 100 : 0}%` }} /></span>
                                  <span className="w-28 shrink-0 text-right tabular-nums text-gray-600">{fmtN(r._sum.sessions ?? 0)} oturum</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
                {!i.properties.length && <li className="px-4 py-6 text-center text-sm text-gray-500">Erişilebilen mülk yok.</li>}
              </ul>
              <form action={addProperty} className="flex flex-wrap items-end gap-2 border-t border-gray-100 px-4 py-3">
                <input type="hidden" name="integrationId" value={i.id} />
                <label className="block"><span className="label">Mülk kimliğini elle ekle</span><input className="input" name="propertyId" inputMode="numeric" placeholder="ör. 123456789" required /></label>
                <button className="btn-ghost">Doğrula ve ekle</button>
              </form>
            </div>
          );
        })}
      </section>
    </>
  );
}
