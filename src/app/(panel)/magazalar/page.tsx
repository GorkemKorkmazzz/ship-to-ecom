import { addStore, deleteStore, setupWebhooks } from "@/app/actions";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, StoreBadge, SyncButton, fmtDate } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader title="Mağazalar" desc="İki ikas mağazanızı bağlayın; aynı SKU'lu ürünler ortak stoktan düşer.">
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
            <div className="mt-3 text-sm text-gray-600">{s.storeName}.myikas.com</div>
            <dl className="mt-2 space-y-1 text-sm text-gray-500">
              <div>Son senkron: {fmtDate(s.lastSyncAt)}</div>
              <div>Anlık bildirim (webhook): {s.webhooksActive ? "Açık" : "Kapalı"}</div>
            </dl>
            {s.lastError && <p className="mt-3 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{s.lastError}</p>}
            <div className="mt-4 flex gap-2">
              {!s.webhooksActive && (
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

        {stores.length < 2 && (
          <form action={addStore} className="card space-y-3">
            <h2 className="font-semibold">{stores.length ? "İkinci mağazayı bağla" : "Mağaza bağla"}</h2>
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
          </form>
        )}
      </div>
    </>
  );
}
