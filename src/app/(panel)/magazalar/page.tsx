import { addStore, deleteStore, setupWebhooks } from "@/app/actions";
import Link from "next/link";
import { getStores } from "@/lib/cache";
import { hasBiggerPlan, planById, storeLimitOf } from "@/lib/plans";
import { isIkas, platformName, storeHost } from "@/lib/platforms";
import { tsoftApp } from "@/lib/platforms/tsoft";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge, SyncButton, fmtDate } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);
  const limit = storeLimitOf(user.plan);
  const planName = planById(user.plan)?.name ?? "Mevcut";

  return (
    <>
      <PageHeader title="Mağazalar" desc={`${planName} paketi: ${stores.length} / ${limit} mağaza bağlı · aynı SKU'lu ürünler ortak stoktan düşer.`}>
        {stores.length > 0 && <SyncButton path="/magazalar" />}
      </PageHeader>
      <Flash {...sp} />

      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((s, i) => (
          <div key={s.id} className="card">
            <div className="flex items-center justify-between">
              <StoreBadge label={s.label} index={i} />
              <span className={`badge ${s.lastError ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {s.lastError ? "Hata" : "Bağlı"}
              </span>
            </div>
            <div className="mt-3 text-sm text-gray-600">{storeHost(s)} <span className="badge ml-1 bg-gray-100 text-gray-600">{platformName(s)}</span></div>
            <dl className="mt-2 space-y-1 text-sm text-gray-500">
              <div>Son senkron: {fmtDate(s.lastSyncAt)}</div>
              {isIkas(s) && <div>Anlık bildirim (webhook): {s.webhooksActive ? "Açık" : "Kapalı"}</div>}
            </dl>
            {s.lastError && <p className="mt-3 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{s.lastError}</p>}
            <div className="mt-4 flex gap-2">
              {isIkas(s) && !s.webhooksActive && (
                <form action={setupWebhooks}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn-ghost">Webhook kur</button>
                </form>
              )}
              <form action={deleteStore}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn-ghost text-red-600">Kaldır</button>
              </form>
            </div>
          </div>
        ))}

        {stores.length < limit ? (
          <form action={addStore} className="card space-y-3">
            <h2 className="font-semibold">{stores.length === 0 ? "ikas mağazası bağla" : stores.length === 1 ? "İkinci mağazayı bağla (ikas)" : "Yeni ikas mağazası bağla"}</h2>
            <div>
              <label className="label" htmlFor="label">Panelde görünecek ad</label>
              <input className="input" id="label" name="label" placeholder="Örn. Ana Mağaza" required />
            </div>
            <div>
              <label className="label" htmlFor="storeName">ikas mağaza adı</label>
              <div className="flex items-center gap-2">
                <input className="input" id="storeName" name="storeName" placeholder="magazam" required />
                <span className="text-sm text-gray-500">.myikas.com</span>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="clientId">Client ID</label>
              <input className="input font-mono" id="clientId" name="clientId" autoComplete="off" required />
            </div>
            <div>
              <label className="label" htmlFor="clientSecret">Client Secret</label>
              <input className="input font-mono" id="clientSecret" name="clientSecret" type="password" autoComplete="off" required />
            </div>
            <button className="btn">Bağla</button>
            <p className="text-xs leading-relaxed text-gray-500">
              ikas panelinde <b>Uygulamalar → Uygulamalarım → Daha Fazla → Özel Uygulama Oluştur</b> ile bir uygulama açın.
              Ürün, stok ve sipariş izinlerini verin; <b>müşteri izni vermenize gerek yok</b> — bu platform müşteri bilgisi okumaz.
            </p>
            <div className="border-t border-gray-100 pt-3">
              <h3 className="text-sm font-semibold">T-Soft mağazası</h3>
              {tsoftApp() ? (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">T-Soft panelinize yönlendirilirsiniz; uygulamayı onayladığınızda mağaza buraya eklenir. Ürün, stok, fiyat ve sipariş izni istenir; müşteri verisi izni istenmez.</p>
                  <a href="/api/tsoft/baglan" className="btn-ghost mt-2">T-Soft mağazası bağla</a>
                </>
              ) : (
                <p className="mt-1 text-xs leading-relaxed text-gray-500">T-Soft bağlantısı henüz açık değil: uygulama anahtarları (TSOFT_CLIENT_ID, TSOFT_CLIENT_SECRET) tanımlanınca burada “T-Soft mağazası bağla” düğmesi görünür.</p>
              )}
            </div>
          </form>
        ) : (
          <div className="card flex flex-col items-start justify-center border-dashed bg-amber-50/60">
            <span className="badge bg-amber-100 text-amber-800">Mağaza hakkı doldu</span>
            <h2 className="mt-3 font-semibold">{planName} paketinde en fazla {limit} mağaza bağlanabilir</h2>
            {hasBiggerPlan(user.plan) ? (
              <>
                <p className="mt-1 text-sm text-gray-600">Daha fazla mağaza eklemek için lütfen paketinizi değiştirin.</p>
                <Link href="/lisans" className="btn mt-4">Paketi değiştir</Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-gray-600">En geniş pakettesiniz. Daha fazla mağaza için destek ile iletişime geçin.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
