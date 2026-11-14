import Link from "next/link";
import { Fragment } from "react";
import { MODULES, MODULE_GROUPS, PLANS, TRIAL_DAYS, modulesOf } from "@/lib/plans";
import { hasValidSession } from "@/lib/session";
import { Logo } from "../(panel)/logo";
import { Pricing } from "./pricing";

// Entegrasyonlar: yalnızca panelde gerçekten bağlanabilenler.
const INTEGRATIONS: [string, string, string][] = [
  ["ikas", "Mağaza", "text-gray-900"], ["Meta Ads", "Reklam", "text-blue-600"], ["Google Ads", "Reklam", "text-amber-600"], ["Google Analytics 4", "Analitik", "text-orange-500"],
];

const STEPS = [
  ["E-ticaret sitenizi bağlayın", "Kullandığınız altyapıyı seçin ve mağazalarınızı panele bağlayın. Birkaç dakika sürer."],
  ["Ürünler otomatik eşleşsin", "Aynı SKU'ya sahip ürünler kendiliğinden eşleşir; farklı olanları tek tıkla eşleştirirsiniz."],
  ["Tek panelden yönetin", "Stok, fiyat, sipariş ve kampanyaları tek yerden takip edin; gerisini ShipToEcom halleder."],
];

const FAQ = [
  ["Müşteri bilgilerimi alıyor musunuz?", "Hayır. ShipToEcom müşteri adı, e-posta, telefon ve adres bilgilerini mağazanızdan hiç istemez ve saklamaz. Yalnızca ürün, stok ve sipariş kalemleriyle çalışır."],
  ["Mağazalarımdaki SKU'lar farklıysa ne olur?", "SKU eşleştirme ekranı aynı barkod veya aynı ada sahip ürünleri önerir; siz onaylarsınız. Mağazalarınızdaki SKU'lar değişmez."],
  ["Deneme süresi bitince ne olur?", `${TRIAL_DAYS} günlük deneme boyunca tüm özellikleri kullanırsınız. Süre sonunda bir paket seçmezseniz mağazalarınıza dokunulmaz; yalnızca senkron durur.`],
  ["Reklam hesaplarımı bağlayabilir miyim?", "Kurumsal pakette Meta Ads, Google Ads (yönetici hesap altındakiler dahil) ve Google Analytics 4 hesaplarınızı salt okuma izniyle bağlayıp verileri web sitelerinize göre raporlayabilirsiniz."],
  ["İstediğim zaman iptal edebilir miyim?", "Evet. Aylık pakette dilediğiniz zaman iptal edebilirsiniz; mağazalarınız olduğu gibi çalışmaya devam eder."],
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
            <a href="#ozellikler" className="hover:text-gray-900">Modüller</a>
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
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">E-ticaret mağazaları için</span>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl" style={{ textWrap: "balance" }}>
            E-ticaret mağazalarınız, <span className="text-indigo-600">tek stok</span> ve tek panel
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-600">
            ShipToEcom e-ticaret mağazalarınızı birbirine bağlar: stoklar otomatik eşitlenir, siparişler tek ekranda toplanır, fiyat ve kampanyalar tek yerden yönetilir. Kurumsal pakette Meta, Google Ads ve GA4 verileriniz de aynı panelde.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/kayit" className="rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700">{TRIAL_DAYS} gün ücretsiz dene</Link>
            <a href="#paketler" className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">Paketleri incele</a>
          </div>
          <p className="mt-4 text-xs text-gray-500">Kredi kartı gerekmez · Müşteri verisi alınmaz</p>
          <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-3" aria-label="Entegrasyonlar">
            {INTEGRATIONS.map(([name, kind, cls]) => (
              <li key={name} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
                <span className={`font-bold ${cls}`}>{name}</span>
                <span className="text-xs text-gray-400">{kind}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="ne-yapiyoruz" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Ne yapıyoruz?</h2>
            <p className="mt-4 text-gray-600">
              Aynı ürünleri birden fazla e-ticaret mağazasında satan markalar, stoğu elle eşitlemek zorunda kalır. Bir mağazada biten ürün diğerinde satılmaya devam eder; sipariş iptalleri ve müşteri şikâyetleri başlar.
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
          <h2 className="text-center text-3xl font-bold tracking-tight">Modüller</h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">Mağaza operasyonundan reklam analizine kadar; her modül bir pakete dahildir ve üst paketler alttakileri kapsar.</p>
          {MODULE_GROUPS.map((g) => {
            const mods = MODULES.filter((m) => m.group === g);
            const plan = PLANS.find((p) => p.id === mods[0]?.plan);
            return (
              <div key={g} className="mt-12">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-bold tracking-tight">{g}</h3>
                  {plan && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${plan.id === "kurumsal" ? "bg-gray-900 text-white" : plan.id === "profesyonel" ? "bg-indigo-600 text-white" : "bg-indigo-100 text-indigo-700"}`}>{plan.id === "baslangic" ? "Tüm paketlerde" : `${plan.name} paketinden itibaren`}</span>}
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {mods.map((m) => (
                    <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-6">
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={m.icon} /></svg>
                      </span>
                      <h4 className="mt-4 font-semibold">{m.name}</h4>
                      <p className="mt-2 text-sm text-gray-600">{m.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section id="paketler" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight">Paketler</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-gray-600">Tüm paketler {TRIAL_DAYS} gün ücretsiz. Fiyatlara KDV dahil değildir.</p>
        <Pricing />

        <div className="mt-14">
          <h3 className="text-center text-xl font-bold tracking-tight">Paket karşılaştırması</h3>
          <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Modül</th>
                  {PLANS.map((p) => <th key={p.id} className={`px-4 py-3 text-center font-semibold ${p.popular ? "text-indigo-700" : ""}`}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-4 py-3 text-gray-700">Mağaza sayısı</td>
                  {PLANS.map((p) => <td key={p.id} className="px-4 py-3 text-center font-semibold tabular-nums">{p.storeLimit}</td>)}
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-700">SKU sınırı</td>
                  {PLANS.map((p) => <td key={p.id} className="px-4 py-3 text-center font-semibold tabular-nums">{p.skuLimit === null ? "Sınırsız" : new Intl.NumberFormat("tr-TR").format(p.skuLimit)}</td>)}
                </tr>
                {MODULE_GROUPS.map((g) => (
                  <Fragment key={g}>
                    <tr className="bg-gray-50/70"><td colSpan={1 + PLANS.length} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{g}</td></tr>
                    {MODULES.filter((m) => m.group === g).map((m) => (
                      <tr key={m.id}>
                        <td className="px-4 py-3 text-gray-700">{m.name}</td>
                        {PLANS.map((p) => {
                          const has = modulesOf(p.id).some((x) => x.id === m.id);
                          return (
                            <td key={p.id} className="px-4 py-3 text-center">
                              {has ? (
                                <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Dahil"><path d="M5 12l5 5 9-10" /></svg>
                              ) : (
                                <span className="text-gray-300" aria-label="Dahil değil">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
          <span>© ShipToEcom. Adı geçen e-ticaret altyapıları kendi sahiplerinin markasıdır; ShipToEcom bağımsız bir üründür.</span>
          <Link href="/giris" className="font-medium text-indigo-600 hover:underline">Giriş yap</Link>
        </div>
      </footer>
    </div>
  );
}
