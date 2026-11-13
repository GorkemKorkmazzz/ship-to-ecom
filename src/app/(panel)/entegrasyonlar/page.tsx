import Link from "next/link";
import { getStores } from "@/lib/cache";
import { storeLimitOf } from "@/lib/plans";
import { tsoftApp } from "@/lib/platforms/tsoft";
import { requireUser } from "@/lib/session";
import { PageHeader } from "../ui";

type Integration = {
  id: string; // Store.platform değeri
  name: string;
  mark: string; // logo kutusundaki kısa yazı
  markClass: string;
  features: string[];
  ready: boolean; // false = yakında
};

// E-ticaret altyapıları. Yeni platform eklendiğinde buraya bir satır ve src/lib/platforms altına bir adaptör eklenir.
const PLATFORMS: Integration[] = [
  { id: "ikas", name: "ikas", mark: "ikas", markClass: "text-gray-900", features: ["Ürünler", "Stok", "Siparişler", "Kampanyalar"], ready: true },
  { id: "tsoft", name: "T-Soft", mark: "T-Soft", markClass: "text-orange-600", features: ["Ürünler", "Stok", "Siparişler"], ready: true },
  { id: "ticimax", name: "Ticimax", mark: "Tici", markClass: "text-blue-900", features: ["Ürünler", "Stok", "Siparişler"], ready: false },
  { id: "shopify", name: "Shopify", mark: "Shopify", markClass: "text-emerald-700", features: ["Ürünler", "Stok", "Siparişler"], ready: false },
];

export default async function Page() {
  const user = await requireUser();
  const stores = await getStores(user.id);
  const full = stores.length >= storeLimitOf(user.plan);
  const tsoftOpen = !!tsoftApp();

  return (
    <>
      <PageHeader title="Entegrasyonlar" desc="Mağazanızın altyapısını seçin; bağladığınız mağazalar ortak stok ve sipariş ekranına eklenir." />

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-6 py-4 text-lg font-medium">Hangi e-ticaret altyapısını kullanıyorsunuz?</h2>
        <div className="grid gap-5 p-6 sm:grid-cols-2 xl:grid-cols-4">
          {PLATFORMS.map((p) => {
            const count = stores.filter((s) => s.platform === p.id).length;
            // Bağlama adımı: ikas formu Mağazalar sayfasında; T-Soft, T-Soft panelindeki onay ekranına gider.
            const action =
              !p.ready ? null
              : full ? { href: "/lisans", label: "Paketi değiştir", note: "Mağaza hakkınız doldu." }
              : p.id === "tsoft" ? (tsoftOpen ? { href: "/api/tsoft/baglan", label: "Mağaza bağla", note: null } : null)
              : { href: "/magazalar", label: "Mağaza bağla", note: null };
            return (
              <div key={p.id} className={`flex flex-col items-center rounded-xl border border-gray-200 px-5 py-8 text-center ${p.ready ? "" : "bg-gray-50/60"}`}>
                <span className={`flex h-16 w-16 items-center justify-center rounded-lg border border-gray-200 bg-white text-[13px] font-bold tracking-tight shadow-sm ${p.markClass} ${p.ready ? "" : "opacity-60"}`}>{p.mark}</span>
                <h3 className="mt-4 text-lg font-medium">{p.name}</h3>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {p.features.map((f) => (
                    <span key={f} className="rounded-md border border-gray-200 px-2 py-0.5 text-sm text-gray-600">{f}</span>
                  ))}
                </div>
                <div className="mt-5 flex min-h-[4.5rem] flex-col items-center justify-end gap-2">
                  {!p.ready ? (
                    <span className="badge bg-gray-100 text-gray-600">Yakında</span>
                  ) : (
                    <>
                      <span className={`badge ${count ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{count ? `${count} mağaza bağlı` : "Bağlı mağaza yok"}</span>
                      {action ? (
                        // API rotası önceden yüklenmesin diye düz bağlantı.
                        action.href.startsWith("/api/") ? <a href={action.href} className="btn-ghost">{action.label}</a> : <Link href={action.href} className="btn-ghost">{action.label}</Link>
                      ) : (
                        <span className="text-xs text-gray-500">Bağlantı henüz açık değil</span>
                      )}
                      {action?.note && <span className="text-xs text-gray-500">{action.note}</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <h2 className="border-b border-gray-100 px-6 py-4 text-lg font-medium">Pazaryerleri</h2>
        <div className="p-6">
          <div className="rounded-xl border border-dashed border-gray-300 px-5 py-8 text-center">
            <span className="badge bg-gray-100 text-gray-600">Yakında</span>
            <p className="mt-2 text-sm text-gray-500">Pazaryeri entegrasyonları bu bölüme eklenecek.</p>
          </div>
        </div>
      </section>
    </>
  );
}
