import Link from "next/link";
import { TRIAL_DAYS } from "@/lib/plans";
import { hasValidSession } from "@/lib/session";
import { Logo } from "../(panel)/logo";
import { Pricing } from "./pricing";

const FEATURES = [
  ["Ortak stok", "Aynı SKU'lu ürünler iki mağazada tek stoktan düşer. Bir mağazada satılan ürün diğerinde de otomatik azalır.", "M4 20V10M10 20V4M16 20v-8M22 20H2"],
  ["Birleşik siparişler", "İki mağazanın siparişlerini tek ekranda, mağaza etiketi, durum ve kargo barkoduyla görün.", "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01"],
  ["Otomatik fiyat kuralları", "Bir mağazanın fiyatını diğerinden yüzde veya sabit farkla hesaplatın; her senkronda güncel kalsın.", "M12 3v18M17 7H9.5a2.5 2.5 0 000 5h5a2.5 2.5 0 010 5H6"],
  ["Tek formdan ürün ekleme", "Ürünü bir kez girin; varyantları, görselleri ve stoğuyla iki mağazada birden oluşsun.", "M12 5v14M5 12h14"],
  ["Kampanya yönetimi", "Yüzde, tutar ve ücretsiz kargo kampanyalarını, kupon kodlarıyla iki mağazada aynı anda açın.", "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z"],
  ["Stok güvenliği", "Güvenlik stoğu, mağaza payı ve düşük stok uyarılarıyla fazla satışın önüne geçin.", "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4zM9 12l2 2 4-4"],
] as const;

const STEPS = [
  ["Mağazalarınızı bağlayın", "İki ikas mağazanızda birer özel uygulama açıp bilgilerini panele girin. Birkaç dakika sürer."],
  ["Ürünler otomatik eşleşsin", "Aynı SKU'ya sahip ürünler kendiliğinden eşleşir; farklı olanları tek tıkla eşleştirirsiniz."],
  ["Tek panelden yönetin", "Stok, fiyat, sipariş ve kampanyaları tek yerden takip edin; gerisini ShipToEcom halleder."],
];

const FAQ = [
  ["Müşteri bilgilerimi alıyor musunuz?", "Hayır. ShipToEcom müşteri adı, e-posta, telefon ve adres bilgilerini ikas'tan hiç istemez ve saklamaz. Yalnızca ürün, stok ve sipariş kalemleriyle çalışır."],
  ["Mağazalarımdaki SKU'lar farklıysa ne olur?", "SKU eşleştirme ekranı aynı barkod veya aynı ada sahip ürünleri önerir; siz onaylarsınız. ikas'taki SKU'larınız değişmez."],
  ["Deneme süresi bitince ne olur?", `${TRIAL_DAYS} günlük deneme boyunca tüm özellikleri kullanırsınız. Süre sonunda bir paket seçmezseniz mağazalarınıza dokunulmaz; yalnızca senkron durur.`],
  ["İstediğim zaman iptal edebilir miyim?", "Evet. Aylık pakette dilediğiniz zaman iptal edebilirsiniz; ikas mağazalarınız olduğu gibi çalışmaya devam eder."],
];

export default async function Page() {
  const loggedIn = await hasValidSession();
  return (
    <div className="bg-white text-gray-900">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link href="/"><Logo /></Link>
          <nav className="hidden flex-1 gap-6 text-sm font-medium text-gray-600 md:flex">
            <a href="#ne-yapiyoruz" className="hover:text-gray-900">Ne yapıyoruz</a>
            <a href="#ozellikler" className="hover:text-gray-900">Özellikler</a>
            <a href="#paketler" className="hover:text-gray-900">Paketler</a>
            <a href="#sss" className="hover:text-gray-900">SSS</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {loggedIn ? (
              <Link href="/panel" className="btn">Panele git</Link>
            ) : (
              <>
                <Link href="/giris" className="btn-ghost">Giriş yap</Link>
                <Link href="/kayit" className="btn hidden sm:inline-flex">Ücretsiz dene</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="border-b border-gray-100 bg-gradient-to-b from-indigo-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:py-24">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">ikas mağazaları için</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
            İki ikas mağazanız, <span className="text-indigo-600">tek stok</span> ve tek panel
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            ShipToEcom iki ikas mağazanızı birbirine bağlar: stoklar otomatik eşitlenir, siparişler tek ekranda toplanır, fiyat ve kampanyalar tek yerden yönetilir.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/kayit" className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700">{TRIAL_DAYS} gün ücretsiz dene</Link>
            <a href="#paketler" className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">Paketleri incele</a>
          </div>
          <p className="mt-4 text-xs text-gray-500">Kredi kartı gerekmez · Müşteri verisi alınmaz</p>
        </div>
      </section>

      <section id="ne-yapiyoruz" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Ne yapıyoruz?</h2>
            <p className="mt-4 text-gray-600">
              Aynı ürünleri iki ayrı ikas mağazasında satan markalar, stoğu elle eşitlemek zorunda kalır. Bir mağazada biten ürün diğerinde satılmaya devam eder; sipariş iptalleri ve müşteri şikâyetleri başlar.
            </p>
            <p className="mt-3 text-gray-600">
              ShipToEcom bu işi otomatikleştirir. Mağazalarınızı bir kez bağlarsınız; hangi mağazada satış olursa olsun ortak stok güncellenir ve iki mağazaya da yazılır.
            </p>
          </div>
          <ol className="space-y-4">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4 rounded-xl border border-gray-200 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="ozellikler" className="scroll-mt-20 border-y border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">Özellikler</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">İki mağazayı tek mağaza gibi yönetmek için gereken her şey.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, text, d]) => (
              <div key={title} className="rounded-xl border border-gray-200 bg-white p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
                </span>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-gray-600">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="paketler" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Paketler</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">Tüm paketler {TRIAL_DAYS} gün ücretsiz. Fiyatlara KDV dahil değildir.</p>
        <Pricing />
      </section>

      <section id="sss" className="scroll-mt-20 border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight">Sık sorulan sorular</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="rounded-xl border border-gray-200 bg-white p-5">
                <summary className="cursor-pointer font-semibold">{q}</summary>
                <p className="mt-3 text-sm text-gray-600">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-indigo-600">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center text-white">
          <h2 className="text-3xl font-bold tracking-tight">Stoklarınızı bugün eşitleyin</h2>
          <p className="mx-auto mt-3 max-w-xl text-indigo-100">Kurulum birkaç dakika sürer. {TRIAL_DAYS} gün boyunca tüm özellikler ücretsiz.</p>
          <Link href="/kayit" className="mt-6 inline-block rounded-lg bg-white px-6 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Ücretsiz denemeyi başlat</Link>
        </div>
      </section>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <span>© ShipToEcom. ikas, ikas Teknoloji A.Ş.&apos;nin markasıdır; ShipToEcom bağımsız bir üründür.</span>
          <Link href="/giris" className="font-medium text-indigo-600 hover:underline">Giriş yap</Link>
        </div>
      </footer>
    </div>
  );
}
