import Link from "next/link";
import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { storeHost } from "@/lib/platforms";
import { requireUser } from "@/lib/session";
import { moduleTotals } from "@/lib/storefront";
import { sfModule } from "@/lib/storefront/modules";
import { Flash } from "../ui";
import { rotateKey } from "./actions";
import { Dashboard, type CardData } from "./dashboard";

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const snippet = (sfKey: string) => `<script async src="${appUrl()}/sf/loader.js" data-key="${sfKey}"></script>`;

// Dashboard'daki sıra ve kart metinleri. Anahtar, modül kaydıyla (src/lib/storefront/modules.ts) aynıdır.
const ORDER: { key: string; icon: CardData["icon"]; text: string }[] = [
  { key: "kampanya-bari", icon: "megaphone", text: "Mağazanın üstünde ya da altında kampanya duyurusu gösterir. Tarih, sayfa ve cihaz hedeflemeli, butonlu ve kayan yazılı olabilir." },
  { key: "bilgi-seridi", icon: "align", text: "Ürün sayfasında ürün adı, fiyat ya da Sepete Ekle butonu çevresinde kargo, iade, taksit ve indirim kodu gibi kısa mesajlar gösterir." },
  { key: "cok-al-az-ode", icon: "star", text: "Adet arttıkça artan indirim. Kampanya kademeli indirim olarak oluşturulur ve ürün sayfasında gösterilir." },
  { key: "tukenmek-uzere", icon: "clock", text: "Seçili varyantın stok eşiğinin altına indiğinde ürün sayfasında stok uyarısı gösterir." },
  { key: "hediye-carki", icon: "gift", text: "Ziyaretçilerin çark çevirerek belirlenen olasılıklarla indirimli ödüller kazanmasını sağlar." },
  { key: "flash-urunler", icon: "bolt", text: "Süreli indirimli ürünleri seçilen sayfada geri sayımla listeler. İndirim ikas'ta kampanya olarak uygulanır." },
  { key: "fiyat-alti-indirim", icon: "tag", text: "Ürün detay sayfasında fiyatın altında ürüne ya da varyanta özel indirimi, eski ve yeni fiyatı ve kazancı gösterir." },
  { key: "urun-etiketleri", icon: "badge", text: "Ürün görsellerinin köşesinde Yeni, Çok Satan, İndirimde, Tükendi gibi elle ya da otomatik etiketler gösterir." },
  { key: "duyuru-cubugu", icon: "bell", text: "Sayfanın üstünde ya da altında kısa bir duyuru ve isteğe bağlı bağlantı gösterir." },
];

const DAYS = 14;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export default async function Page({ searchParams }: { searchParams: Promise<{ magaza?: string; ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "vitrin")) return <Locked moduleId="vitrin" />;
  const sp = await searchParams;
  const stores = await getStores(user.id);
  if (!stores.length)
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">Vitrin Modülleri</h1>
        <p className="card mt-5 text-sm text-gray-600">Önce <Link className="font-medium text-indigo-600 underline" href="/entegrasyonlar">bir ikas mağazası bağlayın</Link>.</p>
      </>
    );
  const store = stores.find((s) => s.id === sp.magaza) ?? stores[0];

  // Gerçek veri: modül kayıtları, son 30 gün toplamları ve son 14 günün günlük görüntülenme/tıklanmaları.
  const today = new Date();
  const since = new Date(today.getTime() - (DAYS - 1) * 86_400_000);
  const [rows, totals, daily] = await Promise.all([
    db.storeModule.findMany({ where: { storeId: store.id }, select: { moduleKey: true, enabled: true } }),
    moduleTotals(store.id),
    db.moduleStat.groupBy({ by: ["day", "type"], where: { storeId: store.id, day: { gte: dayKey(since) }, type: { in: ["view", "click"] } }, _sum: { count: true } }),
  ]);
  const enabled = new Map(rows.map((r) => [r.moduleKey, r.enabled]));
  const days = Array.from({ length: DAYS }, (_, i) => dayKey(new Date(since.getTime() + i * 86_400_000)));
  const series = (type: string) => days.map((d) => daily.find((x) => x.day === d && x.type === type)?._sum.count ?? 0);

  const cards: CardData[] = ORDER.flatMap((o) => {
    const m = sfModule(o.key);
    if (!m) return [];
    const t = totals[o.key];
    return [{ key: o.key, name: m.name, text: o.text, icon: o.icon, enabled: enabled.get(o.key) ?? false, views: t?.view ?? 0, clicks: t?.click ?? 0 }];
  });
  const top = [...cards].sort((a, b) => b.views + b.clicks - (a.views + a.clicks))[0];

  return (
    <>
      <Flash ok={sp.ok} hata={sp.hata} />
      <Dashboard
        stores={stores.map((s) => ({ id: s.id, label: s.label, host: storeHost(s) }))}
        storeId={store.id}
        cards={cards}
        views={series("view")}
        clicks={series("click")}
        active={cards.filter((c) => c.enabled).length}
        top={top && top.views + top.clicks > 0 ? top.name : null}
        storeCard={
          <section className="relative mb-5 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-indigo-100/60 p-5 sm:p-6">
            {/* Dekoratif geometrik şekiller */}
            <svg className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-2/3 text-white/60 md:block" viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden>
              <path d="M180 160L420 0h180v160z" fill="currentColor" opacity=".5" />
              <path d="M330 160L520 0h80v160z" fill="currentColor" opacity=".6" />
              <circle cx="120" cy="20" r="70" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <div className="relative flex flex-wrap items-center gap-5">
              <StoreArt />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900">Mağaza: {store.label}</h2>
                <p className="mt-0.5 text-sm text-slate-500">Domain: <span className="break-all font-medium text-gray-700">{storeHost(store)}</span></p>
                <span className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${store.sfKey ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                    {store.sfKey ? <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z" /> : <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />}
                  </svg>
                  {store.sfKey ? "Vitrin anahtarı oluşturulmuş" : "Vitrin anahtarı yok"}
                </span>
              </div>
              <form action={rotateKey}>
                <input type="hidden" name="storeId" value={store.id} />
                <button className="inline-flex items-center gap-2 rounded-xl border-2 border-indigo-500 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /></svg>
                  {store.sfKey ? "Anahtarı Yenile" : "Anahtar Oluştur"}
                </button>
              </form>
            </div>
            {store.sfKey && (
              <details className="relative mt-4">
                <summary className="cursor-pointer text-xs font-medium text-indigo-700">Kurulum kodu (ikas temasının özel kod alanına eklenir)</summary>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100">{snippet(store.sfKey)}</pre>
                <p className="mt-1 text-xs text-slate-500">Anahtar yenilenirse eski kod çalışmaz. Otomatik kurulum yapılmıyor: ikas Admin API üzerinden tema betiği ekleme doğrulanmadı.</p>
              </details>
            )}
          </section>
        }
      />
    </>
  );
}

/** Mağaza illüstrasyonu (tente, vitrin ve ayar dişlisi). */
function StoreArt() {
  return (
    <svg viewBox="0 0 160 110" className="h-24 w-36 shrink-0" aria-hidden>
      <ellipse cx="78" cy="102" rx="64" ry="6" fill="#c7d2fe" opacity=".6" />
      <rect x="28" y="40" width="100" height="58" rx="6" fill="#eef2ff" stroke="#a5b4fc" strokeWidth="2" />
      <rect x="40" y="56" width="34" height="42" rx="3" fill="#a5b4fc" />
      <rect x="84" y="56" width="32" height="24" rx="3" fill="#c7d2fe" />
      <path d="M22 26h112l-6 18H28z" fill="#6366f1" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${22 + i * 22.4} 26h11.2l-2 18h-9.2z`} fill="#fff" opacity=".85" />
      ))}
      <path d="M28 44c0 7 10 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0 1 7 11 7 11 0" fill="#818cf8" />
      <rect x="30" y="14" width="96" height="12" rx="4" fill="#4f46e5" />
      <circle cx="128" cy="80" r="17" fill="#6366f1" stroke="#fff" strokeWidth="3" />
      <path d="M128 72l2 2.5 3-.6.6 3 2.5 2-2.5 2-.6 3-3-.6-2 2.5-2-2.5-3 .6-.6-3-2.5-2 2.5-2 .6-3 3 .6z" fill="#fff" />
      <circle cx="128" cy="80" r="3" fill="#6366f1" />
    </svg>
  );
}
