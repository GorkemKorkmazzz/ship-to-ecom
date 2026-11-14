import Link from "next/link";
import { deleteStore, setupWebhooks } from "@/app/actions";
import { getStores } from "@/lib/cache";
import { storeLimitOf } from "@/lib/plans";
import { storeHost } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { ConfirmButton } from "../siparisler/bulk";
import { Flash, PageHeader, SyncButton, fmtDate } from "../ui";
import { ConnectButton } from "./connect";

type Integration = {
  id: string; // Store.platform değeri
  name: string;
  mark: string; // logo kutusundaki yazı
  markClass: string;
  features: string[];
};

// Desteklenen e-ticaret altyapısı: ikas.
const PLATFORMS: Integration[] = [
  { id: "ikas", name: "ikas", mark: "ikas", markClass: "text-gray-900", features: ["Ürünler", "Stok", "Siparişler", "Fiyatlar"] },
];

function Logo({ p }: { p: Integration }) {
  return <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-[11px] font-bold tracking-tight shadow-sm ${p.markClass}`}>{p.mark}</span>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const stores = await getStores(user.id);
  const limit = storeLimitOf(user.plan);
  const full = stores.length >= limit;

  const card = (p: Integration) => {
    const mine = stores.filter((s) => s.platform === p.id);
    const mode = full ? "full" : "ikas";
    return (
      <section key={p.id} className="flex flex-col rounded-xl border border-gray-200 bg-white">
        <div className="flex items-start gap-3 p-5">
          <Logo p={p} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{p.name}</h2>
              <span className={`badge ${mine.length ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{mine.length ? `${mine.length} mağaza bağlı` : "Bağlı mağaza yok"}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.features.map((f) => <span key={f} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-600">{f}</span>)}
            </div>
          </div>
        </div>

        {mine.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.lastError ? "bg-red-500" : "bg-emerald-500"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{s.label}</span>
                    <span className={`badge ${s.lastError ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{s.lastError ? "Hata" : "Aktif"}</span>
                  </div>
                  <div className="truncate text-xs text-gray-500">{storeHost(s)}{s.externalId ? ` · ID ${s.externalId}` : ""} · son senkron {fmtDate(s.lastSyncAt)}</div>
                  {s.lastError && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{s.lastError}</p>}
                </div>
                <details className="relative">
                  <summary className="btn-ghost cursor-pointer list-none">Ayarlar</summary>
                  <div className="absolute right-0 z-20 mt-1 w-60 space-y-1 rounded-lg border border-gray-200 bg-white p-2 text-sm shadow-lg">
                    <Link href="/stok" className="block rounded-md px-2 py-1.5 hover:bg-gray-50">Stok payı ve dağıtım</Link>
                    {s.platform === "ikas" && (
                      <form action={setupWebhooks}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="w-full rounded-md px-2 py-1.5 text-left hover:bg-gray-50" disabled={s.webhooksActive}>{s.webhooksActive ? "Anlık bildirim açık" : "Anlık bildirimi (webhook) kur"}</button>
                      </form>
                    )}
                  </div>
                </details>
                <form action={deleteStore}>
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmButton message={`${s.label} bağlantısı kaldırılsın mı? Mağazadaki ürün ve siparişler silinmez; ortak stok bağları sıfırlanır.`}>Kaldır</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto border-t border-gray-100 p-4">
          <ConnectButton platform={p.id} mode={mode} label={mine.length ? "+ Yeni mağaza bağla" : "Mağaza bağla"} ghost={mine.length > 0} />
        </div>
      </section>
    );
  };

  return (
    <>
      <PageHeader title="Entegrasyonlar" desc={`ikas mağazalarınızı bağlayın ve yönetin · ${stores.length} / ${limit} mağaza`}>
        {stores.length > 0 && <SyncButton path="/entegrasyonlar" />}
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />
      {full && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Paketinizin mağaza hakkı doldu. Daha fazla mağaza için <Link href="/lisans" className="font-medium underline">paketinizi değiştirin</Link>.
        </p>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-gray-400">E-ticaret altyapısı</h2>
      <div className="grid items-start gap-5 lg:grid-cols-2">{PLATFORMS.map(card)}</div>
    </>
  );
}
