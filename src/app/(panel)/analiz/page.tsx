import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { buildAnalysis, parseRange, type ProductStat } from "@/lib/analysis";
import { EXPENSE_CATEGORIES, TXN_TYPES } from "@/lib/finance/ingest-core";
import { requireUser } from "@/lib/session";
import { PageHeader, StoreBadge, fmtMoney } from "../ui";

const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
const PRESETS = [7, 30, 90, 365];

function Table({ title, hint, rows, money, cols }: { title: string; hint?: string; rows: ProductStat[]; money: (n: number, cur?: string | null) => string; cols: ("adet" | "ciro" | "kar" | "marj" | "stok" | "kalan" | "oneri")[] }) {
  const head: Record<string, string> = { adet: "Adet", ciro: "Ciro", kar: "Kâr", marj: "Marj", stok: "Stok", kalan: "Kalan gün", oneri: "Sipariş önerisi" };
  return (
    <section className="card overflow-x-auto p-0">
      <div className="px-5 pt-4">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      <table className="mt-3 w-full">
        <thead className="border-y border-gray-200 bg-gray-50">
          <tr><th className="th">Ürün</th>{cols.map((c) => <th key={c} className="th text-right">{head[c]}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => (
            <tr key={`${p.sku}|${p.paraBirimi ?? ""}`}>
              <td className="td"><Link href={`/stok/detay?sku=${encodeURIComponent(p.sku)}`} className="font-medium hover:text-indigo-700 hover:underline">{p.ad}</Link><div className="font-mono text-xs text-gray-400">{p.sku}</div></td>
              {cols.map((c) => (
                <td key={c} className="td whitespace-nowrap text-right tabular-nums">
                  {c === "adet" && p.adet}
                  {c === "ciro" && money(p.ciro, p.paraBirimi)}
                  {c === "kar" && (p.kar === null ? <span className="text-gray-400" title="Alış fiyatı eksik">—</span> : <span className={p.kar < 0 ? "text-red-600" : "text-emerald-700"}>{money(p.kar, p.paraBirimi)}</span>)}
                  {c === "marj" && (p.marj === null ? "—" : `%${p.marj}`)}
                  {c === "stok" && <span className={p.stok !== null && p.stok <= 0 ? "font-semibold text-red-600" : ""}>{p.stok ?? "—"}</span>}
                  {c === "kalan" && (p.kalanGun === null ? <span className="text-gray-400">satış yok</span> : <span className={p.kalanGun <= 7 ? "font-semibold text-amber-700" : ""}>{p.kalanGun} gün</span>)}
                  {c === "oneri" && (p.siparisOnerisi > 0 ? <span className="font-semibold text-indigo-700">{p.siparisOnerisi} adet</span> : "—")}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td className="td py-8 text-center text-gray-500" colSpan={1 + cols.length}>Bu dönemde veri yok.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

export default async function Page({ searchParams }: { searchParams: Promise<{ baslangic?: string; bitis?: string; hedef?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const cover = Math.min(180, Math.max(7, Number(sp.hedef) || 30));
  const a = await buildAnalysis(user.id, parseRange(sp.baslangic, sp.bitis), cover);
  const money = (n: number, cur?: string | null) => fmtMoney(n, cur ?? a.paraBirimi);
  const today = day(new Date().toISOString());
  const preset = (n: number) => `/analiz?baslangic=${day(new Date(new Date().getTime() - (n - 1) * 86400000).toISOString())}&bitis=${today}&hedef=${cover}`;
  const kpis: [string, string, string?][] = [
    ["Sipariş toplamı", money(a.ozet.ciro), "İptal edilmemiş siparişlerin toplamı (kargo vb. dahil olabilir)"],
    ["Net satış", a.finans[0]?.katmanlar.netSales.amount == null ? "Veri yok" : money(a.finans[0].katmanlar.netSales.amount), "İptal ve iade edilen kalemler düşülmüş ürün satışı"],
    ["Sipariş", String(a.ozet.siparis)],
    ["Satılan adet", String(a.ozet.adet)],
    ["Brüt kâr", money(a.ozet.kar), a.ozet.maliyetiEksikUrun ? `${a.ozet.maliyetiEksikUrun} üründe sipariş anındaki maliyet bilinmiyor` : undefined],
    ["Kritik stok", String(a.ozet.kritikStok)],
  ];

  return (
    <>
      <PageHeader title="Kârlılık ve stok analizi" desc="Kâr, siparişin verildiği tarihte geçerli maliyetle hesaplanır; komisyon, kargo ve KDV henüz dahil değildir. İptal edilen kalemler satışa, iade edilen kalemler net satışa girmez." />
      <form className="card mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Başlangıç</span><input className="input" type="date" name="baslangic" defaultValue={day(a.aralik.baslangic)} max={today} /></label>
        <label className="block"><span className="label">Bitiş</span><input className="input" type="date" name="bitis" defaultValue={day(a.aralik.bitis)} max={today} /></label>
        <label className="block"><span className="label">Hedef stok süresi (gün)</span><input className="input w-28" name="hedef" inputMode="numeric" defaultValue={cover} /></label>
        <button className="btn">Uygula</button>
        <div className="flex flex-wrap gap-1">{PRESETS.map((n) => <Link key={n} href={preset(n)} className="btn-ghost">{n === 365 ? "1 yıl" : `${n} gün`}</Link>)}</div>
      </form>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
        {kpis.map(([k, v, note]) => (
          <div key={k} className="card">
            <div className="text-sm text-gray-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
            {note && <div className={`mt-1 text-xs ${k === "Brüt kâr" ? "text-amber-700" : "text-gray-500"}`}>{note}</div>}
          </div>
        ))}
      </div>

      {a.finans.length > 1 && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Bu dönemde birden fazla para birimiyle sipariş var. Para birimleri toplanmaz: özet {a.paraBirimi} cinsindendir; {a.finans.slice(1).map((f) => `${f.paraBirimi} (${f.siparis} sipariş)`).join(", ")} aşağıdaki finans özetinde ayrı gösterilir.
        </p>
      )}
      <section className="card mt-5 overflow-x-auto p-0">
        <div className="px-5 pt-4">
          <h2 className="font-semibold">Finans özeti</h2>
          <p className="mt-0.5 text-xs text-gray-500">Her katmanın veri durumu ve kaynağı. &quot;Veri yok&quot; sıfır değildir: o kalem henüz sisteme aktarılmıyor. {a.maliyetKaynagi} <Link href="/analiz/maliyetler" className="font-medium text-indigo-700 hover:underline">Maliyet geçmişini yönet →</Link></p>
        </div>
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead className="border-y border-gray-200 bg-gray-50"><tr><th className="th">Katman</th>{a.finans.map((f) => <th key={f.paraBirimi} className="th text-right">{f.paraBirimi}</th>)}<th className="th">Açıklama</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {([["grossSales", "Brüt satış"], ["netSales", "Net satış"], ["productCost", "Ürün maliyeti"], ["grossProfit", "Brüt kâr"], ["salesExpenses", "Satış giderleri"], ["contribution", "Katkı kârı"], ["operatingProfit", "İşletme kârı"]] as const).map(([k, label]) => (
              <tr key={k}>
                <td className="td font-medium">{label}</td>
                {a.finans.map((f) => {
                  const l = f.katmanlar[k];
                  return <td key={f.paraBirimi} className="td whitespace-nowrap text-right tabular-nums">{l.amount === null ? <span className="text-gray-400">Veri yok</span> : <>{money(l.amount, f.paraBirimi)}{l.state === "partial" && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">eksik</span>}</>}</td>;
                })}
                <td className="td text-xs text-gray-500">{a.finans[0]?.katmanlar[k].note}</td>
              </tr>
            ))}
            {a.finans.some((f) => f.tahmin.grossProfit !== null) && (
              <tr className="bg-amber-50/40">
                <td className="td text-xs font-medium text-amber-800">Tahmini brüt kâr</td>
                {a.finans.map((f) => <td key={f.paraBirimi} className="td whitespace-nowrap text-right text-xs tabular-nums text-amber-800">{f.tahmin.grossProfit === null ? "—" : money(f.tahmin.grossProfit, f.paraBirimi)}</td>)}
                <td className="td text-xs text-amber-800">Kesin değildir: maliyeti bilinmeyen {a.finans[0]?.tahmin.estimatedLines ?? 0} kaleme güncel alış fiyatı uygulandı.</td>
              </tr>
            )}
            {a.finans.map((f) => (f.dusulenler.cancelled > 0 || f.dusulenler.refunded > 0) && (
              <tr key={`d-${f.paraBirimi}`}><td className="td text-xs text-gray-500" colSpan={2 + a.finans.length}>{f.paraBirimi}: iptal edilen kalemler {money(f.dusulenler.cancelled, f.paraBirimi)}, iade edilen kalemler {money(f.dusulenler.refunded, f.paraBirimi)} brüt satıştan düşüldü.</td></tr>
            ))}
            {!a.finans.length && <tr><td className="td py-6 text-center text-gray-500" colSpan={2}>Bu dönemde sipariş yok.</td></tr>}
          </tbody>
        </table>
        {a.finans.map((f) => (
          <div key={`x-${f.paraBirimi}`} className="grid gap-3 border-t border-gray-100 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><div className="text-xs text-gray-500">İndirimler ({f.paraBirimi})</div>
              <div>Ürün indirimi: <b>{f.indirim.product === null ? "veri yok" : money(f.indirim.product, f.paraBirimi)}</b></div>
              <div>Sipariş indirimi: <b>{f.indirim.order === null ? "veri yok" : money(f.indirim.order, f.paraBirimi)}</b></div>
              <div className="mt-1 text-[11px] text-gray-400">{f.indirim.orderNote}</div></div>
            <div><div className="text-xs text-gray-500">Kargo geliri (müşteriden)</div>
              <div><b>{f.kargo.ordersWithData ? money(f.kargo.income, f.paraBirimi) : "veri yok"}</b> <span className="text-xs text-gray-400">{f.kargo.ordersWithData} siparişte veri</span></div>
              <div className="mt-1 text-[11px] text-gray-400">Kargo gideri değildir; gider &quot;Satış giderleri&quot;ne girilir.</div></div>
            <div><div className="text-xs text-gray-500">KDV (ayrı tutulur)</div>
              <div>Kalem KDV: <b>{f.vergi.linesKnown ? money(f.vergi.lines, f.paraBirimi) : "veri yok"}</b> <span className="text-xs text-gray-400">{f.vergi.linesKnown}/{f.vergi.linesTotal} kalem</span></div>
              <div>Kargo KDV: <b>{money(f.vergi.shipping, f.paraBirimi)}</b> · Gider KDV: <b>{money(f.vergi.expenses, f.paraBirimi)}</b></div>
              <div className="mt-1 text-[11px] text-gray-400">{f.vergi.note}</div></div>
            <div><div className="text-xs text-gray-500">Satış giderleri dökümü</div>
              {Object.keys(f.giderler.byType).length ? Object.entries(f.giderler.byType).map(([k, v]) => <div key={k}>{TXN_TYPES[k as keyof typeof TXN_TYPES] ?? k}: <b>{money(v, f.paraBirimi)}</b></div>) : <div className="text-gray-400">kayıt yok</div>}
              <div className="mt-1 text-[11px] text-gray-400">{f.giderler.ordersWithExpense} siparişte gider kaydı{f.giderler.unlinked ? `, ${f.giderler.unlinked} siparişe bağlı olmayan kayıt` : ""}. İadeler: {f.iadeKaynagi.payments} siparişte ödeme kaydından, {f.iadeKaynagi.lineStatus} kalemde kalem durumundan. <Link href="/analiz/giderler" className="font-medium text-indigo-700 hover:underline">Giderleri yönet →</Link></div></div>
          </div>
        ))}
        {a.finans.map((f) => (
          <div key={`y-${f.paraBirimi}`} className="grid gap-3 border-t border-gray-100 px-5 py-4 text-sm sm:grid-cols-3">
            <div><div className="text-xs text-gray-500">Gider dağıtımı ({f.paraBirimi})</div>
              <div>Ürünlere dağıtılan: <b>{money(f.dagitim.allocated, f.paraBirimi)}</b></div>
              {Object.entries(f.dagitim.byMethod).map(([k, v]) => <div key={k} className="text-xs text-gray-500">{({ REVENUE: "Satış tutarına göre", QUANTITY: "Adede göre", WEIGHT: "Ağırlığa göre", MANUAL: "Elle" } as Record<string, string>)[k] ?? k}: {money(v, f.paraBirimi)}</div>)}
              <div className="mt-1">Dağıtılamayan: <b className={f.dagitim.unallocated > 0 ? "text-amber-700" : ""}>{money(f.dagitim.unallocated, f.paraBirimi)}</b></div>
              {Object.entries(f.dagitim.unallocatedReasons).map(([k, v]) => <div key={k} className="text-xs text-gray-500">{k}: {money(v, f.paraBirimi)}</div>)}</div>
            <div><div className="text-xs text-gray-500">Reklam gideri</div>
              {f.reklam.known ? <>
                <div>Ürünle ilişkilendirilen: <b>{money(f.reklam.attributed, f.paraBirimi)}</b>{f.reklam.attributedNoSales > 0 && <span className="text-xs text-gray-500"> ({money(f.reklam.attributedNoSales, f.paraBirimi)} dönemde satışı olmayan ürünlerde)</span>}</div>
                <div>İlişkilendirilemeyen: <b>{money(f.reklam.unattributed, f.paraBirimi)}</b></div>
                <div className="mt-1 text-[11px] text-gray-400">Yalnızca platformun ürün kırılımıyla kesin eşleşen harcama ürüne yazılır; kalanı ürünlere dağıtılmaz, işletme kârından düşülür.</div>
              </> : <div className="text-gray-400">Reklam hesabı bağlı değil ya da para birimi bilinmiyor.</div>}</div>
            <div><div className="text-xs text-gray-500">İşletme giderleri (döneme paylaştırılmış)</div>
              {f.isletmeGideri === null ? <div className="text-gray-400">Girilmedi; işletme kârı gösterilmez.</div> : <>
                <div><b>{money(f.isletmeGideri, f.paraBirimi)}</b></div>
                {Object.entries(f.isletmeGideriDokumu).map(([k, v]) => <div key={k} className="text-xs text-gray-500">{EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k}: {money(v, f.paraBirimi)}</div>)}
              </>}
              <div className="mt-1 text-[11px]"><Link href="/analiz/isletme-giderleri" className="font-medium text-indigo-700 hover:underline">İşletme giderlerini yönet →</Link></div></div>
          </div>
        ))}
      </section>

      {a.finans[0] && a.finans[0].urunKatki.length > 0 && (
        <section className="card mt-5 overflow-x-auto p-0">
          <div className="px-5 pt-4">
            <h2 className="font-semibold">Ürün bazlı katkı kârı <span className="text-sm font-normal text-gray-500">({a.finans[0].paraBirimi})</span></h2>
            <p className="mt-0.5 text-xs text-gray-500">Katkı kârı = brüt kâr − ürüne dağıtılan satış giderleri − ürünle ilişkilendirilen reklam gideri. Maliyeti eksik üründe hesaplanmaz. Dağıtılmayan giderler ve ilişkilendirilemeyen reklam ürünlere yazılmaz.</p>
          </div>
          <table className="mt-3 w-full min-w-[820px] text-sm">
            <thead className="border-y border-gray-200 bg-gray-50"><tr>{["Ürün", "Net satış", "Maliyet", "Brüt kâr", "Dağıtılan gider", "Reklam", "Katkı kârı"].map((h, i) => <th key={h} className={`th ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {a.finans[0].urunKatki.slice(0, 50).map((p) => (
                <tr key={p.sku}>
                  <td className="td"><div className="font-medium">{p.ad}</div><div className="font-mono text-xs text-gray-500">{p.sku}</div></td>
                  <td className="td text-right tabular-nums">{money(p.netSatis, a.finans[0].paraBirimi)}</td>
                  <td className="td text-right tabular-nums">{p.maliyet === null ? <span className="text-gray-400">eksik</span> : money(p.maliyet, a.finans[0].paraBirimi)}</td>
                  <td className="td text-right tabular-nums">{p.brutKar === null ? "—" : money(p.brutKar, a.finans[0].paraBirimi)}</td>
                  <td className="td text-right tabular-nums">{money(p.dagitilanGider, a.finans[0].paraBirimi)}</td>
                  <td className="td text-right tabular-nums">{money(p.reklam, a.finans[0].paraBirimi)}</td>
                  <td className="td text-right font-semibold tabular-nums">{p.katkiKari === null ? <span className="font-normal text-gray-400">—</span> : <span className={p.katkiKari < 0 ? "text-red-600" : "text-emerald-700"}>{money(p.katkiKari, a.finans[0].paraBirimi)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card mt-5">
        <h2 className="font-semibold">Mağaza bazlı ciro <span className="text-sm font-normal text-gray-500">({a.paraBirimi})</span></h2>
        <div className="mt-3 space-y-3">
          {a.magazalar.map((m, i) => (
            <div key={m.id}>
              <div className="flex items-center justify-between text-sm"><StoreBadge label={m.ad} index={i} /><span className="font-semibold tabular-nums">{money(m.ciro)} <span className="font-normal text-gray-500">· {m.siparis} sipariş</span></span></div>
              <div className="mt-1 h-2 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${a.ozet.ciro ? Math.max(2, (m.ciro / a.ozet.ciro) * 100) : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Table title="En çok satanlar" rows={a.enCokSatan} money={money} cols={["adet", "ciro", "kar"]} />
        <Table title="En çok kazandıranlar" hint="Yalnızca sipariş anındaki maliyeti bilinen ürünler" rows={a.enCokKazandiran} money={money} cols={["adet", "kar", "marj"]} />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Table title="Kritik stoklar" hint="Tükenen, eşiğin altındaki ya da 7 günden kısa sürede bitecek ürünler" rows={a.kritik} money={money} cols={["stok", "kalan", "oneri"]} />
        <Table title="Yeniden sipariş önerileri" hint={`Seçili dönemin günlük satış hızıyla ${cover} günlük stok için gereken adet`} rows={a.siparisOnerileri} money={money} cols={["stok", "kalan", "oneri"]} />
      </div>
      <div className="mt-5">
        <Table title="Ürün bazlı satış ve kârlılık" rows={a.urunler} money={money} cols={["adet", "ciro", "kar", "marj", "stok", "kalan"]} />
      </div>
    </>
  );
}
