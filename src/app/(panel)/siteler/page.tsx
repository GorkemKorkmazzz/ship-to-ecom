import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { storeHost } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { ConfirmButton } from "../siparisler/bulk";
import { Flash, PageHeader } from "../ui";
import { createWebsite, deleteWebsite, updateWebsite } from "./actions";

const PROVIDER: Record<string, [string, string]> = { meta: ["Meta", "bg-blue-100 text-blue-700"], google: ["Google Ads", "bg-amber-100 text-amber-800"] };

function SiteFields({ name, domain, storeId, stores, taken }: { name?: string; domain?: string; storeId?: string | null; stores: { id: string; label: string; host: string }[]; taken: Set<string> }) {
  return (
    <>
      <label className="block"><span className="label">Site adı</span><input className="input" name="name" defaultValue={name} maxLength={80} required placeholder="Örn. Ana mağaza" /></label>
      <label className="block"><span className="label">Alan adı</span><input className="input" name="domain" defaultValue={domain} required placeholder="magazam.com" autoCapitalize="none" inputMode="url" /></label>
      <label className="block">
        <span className="label">Bağlı mağaza</span>
        <select className="input" name="storeId" defaultValue={storeId ?? ""}>
          <option value="">Mağaza yok</option>
          {stores.map((s) => <option key={s.id} value={s.id} disabled={taken.has(s.id) && s.id !== storeId}>{s.label} · {s.host}{taken.has(s.id) && s.id !== storeId ? " (başka sitede)" : ""}</option>)}
        </select>
      </label>
    </>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string; duzenle?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "siteler")) return <Locked moduleId="siteler" />;
  const sp = await searchParams;
  const [stores, sites] = await Promise.all([
    getStores(user.id),
    db.website.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      include: { store: true, analytics: { select: { name: true, propertyId: true } }, adAccounts: { include: { adAccount: { include: { integration: { select: { status: true } } } } } } },
    }),
  ]);
  const storeOpts = stores.map((s) => ({ id: s.id, label: s.label, host: storeHost(s) }));
  const taken = new Set(sites.map((s) => s.storeId).filter((x): x is string => !!x));

  return (
    <>
      <PageHeader title="Web siteleri" desc="Reklam raporları site bazında tutulur. Her siteye bir mağaza ve birden fazla Meta / Google Ads hesabı bağlanabilir." />
      <Flash ok={sp.ok} hata={sp.hata} />
      <div className="grid items-start gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-4 lg:col-span-2">
          {sites.map((site) => {
            const editing = sp.duzenle === site.id;
            return (
              <section key={site.id} className="card">
                {editing ? (
                  <form action={updateWebsite} className="space-y-3">
                    <input type="hidden" name="id" value={site.id} />
                    <SiteFields name={site.name} domain={site.domain} storeId={site.storeId} stores={storeOpts} taken={taken} />
                    <div className="flex gap-2"><button className="btn">Kaydet</button><Link href="/siteler" className="btn-ghost">İptal</Link></div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold">{site.name}</h2>
                        <a href={`https://${site.domain}`} target="_blank" rel="noreferrer" className="text-sm text-indigo-700 hover:underline">{site.domain}</a>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/siteler?duzenle=${site.id}`} className="btn-ghost">Düzenle</Link>
                        <form action={deleteWebsite}>
                          <input type="hidden" name="id" value={site.id} />
                          <ConfirmButton message={`${site.name} silinsin mi? Reklam hesabı eşleştirmeleri kalkar; mağaza ve reklam hesapları silinmez.`}>Sil</ConfirmButton>
                        </form>
                      </div>
                    </div>
                    <dl className="mt-4 grid gap-4 border-t border-gray-100 pt-4 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mağaza</dt>
                        <dd className="mt-1">{site.store ? <>{site.store.label} <span className="text-gray-500">· {storeHost(site.store)}</span></> : <span className="text-gray-500">Bağlı değil</span>}</dd>
                        <dt className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Google Analytics</dt>
                        <dd className="mt-1">{site.analytics ? <>{site.analytics.name} <span className="text-gray-500">· properties/{site.analytics.propertyId}</span></> : <span className="text-gray-500">Bağlı değil</span>}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">Reklam hesapları</dt>
                        <dd className="mt-1 space-y-1">
                          {site.adAccounts.map(({ adAccount: a }) => {
                            const [label, cls] = PROVIDER[a.provider] ?? [a.provider, "bg-gray-100 text-gray-600"];
                            return (
                              <div key={a.id} className="flex flex-wrap items-center gap-2">
                                <span className={`badge ${cls}`}>{label}</span>
                                <span>{a.name}</span>
                                <span className="font-mono text-xs text-gray-400">{a.externalId}</span>
                                {a.integration.status !== "active" && <span className="badge bg-red-100 text-red-700">Bağlantı kesildi</span>}
                              </div>
                            );
                          })}
                          {!site.adAccounts.length && <span className="text-gray-500">Henüz yok. Meta ve Google Ads bağlantısı sonraki aşamada eklenecek.</span>}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
              </section>
            );
          })}
          {!sites.length && <div className="card py-10 text-center text-sm text-gray-500">Henüz site eklenmedi. Sağdaki formdan ilk sitenizi ekleyin.</div>}
        </div>
        <form action={createWebsite} className="card space-y-3">
          <h2 className="font-semibold">Yeni site</h2>
          <SiteFields stores={storeOpts} taken={taken} />
          <button className="btn w-full">Siteyi ekle</button>
          <p className="text-xs text-gray-500">Alan adı protokolsüz kaydedilir (https:// ve www kaldırılır). Aynı alan adı iki kez eklenemez; bir mağaza tek siteye bağlanabilir.</p>
        </form>
      </div>
    </>
  );
}
