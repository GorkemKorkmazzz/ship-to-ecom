import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { buildAnalysis, parseRange, type ProductStat } from "@/lib/analysis";
import { requireUser } from "@/lib/session";
import { PageHeader, StoreBadge, fmtMoney } from "../ui";

const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
const PRESETS = [7, 30, 90, 365];

function Table({ title, hint, rows, money, cols }: { title: string; hint?: string; rows: ProductStat[]; money: (n: number) => string; cols: ("adet" | "ciro" | "kar" | "marj" | "stok" | "kalan" | "oneri")[] }) {
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
            <tr key={p.sku}>
              <td className="td"><Link href={`/stok/detay?sku=${encodeURIComponent(p.sku)}`} className="font-medium hover:text-indigo-700 hover:underline">{p.ad}</Link><div className="font-mono text-xs text-gray-400">{p.sku}</div></td>
              {cols.map((c) => (
                <td key={c} className="td whitespace-nowrap text-right tabular-nums">
                  {c === "adet" && p.adet}
                  {c === "ciro" && money(p.ciro)}
                  {c === "kar" && (p.kar === null ? <span className="text-gray-400" title="Alış fiyatı eksik">—</span> : <span className={p.kar < 0 ? "text-red-600" : "text-emerald-700"}>{money(p.kar)}</span>)}
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
  const money = (n: number) => fmtMoney(n, a.paraBirimi);
  const today = day(new Date().toISOString());
  const preset = (n: number) => `/analiz?baslangic=${day(new Date(new Date().getTime() - (n - 1) * 86400000).toISOString())}&bitis=${today}&hedef=${cover}`;
  const kpis: [string, string, string?][] = [
    ["Ciro", money(a.ozet.ciro)],
    ["Sipariş", String(a.ozet.siparis)],
    ["Satılan adet", String(a.ozet.adet)],
    ["Brüt kâr", money(a.ozet.kar), a.ozet.maliyetiEksikUrun ? `${a.ozet.maliyetiEksikUrun} üründe alış fiyatı eksik` : undefined],
    ["Kritik stok", String(a.ozet.kritikStok)],
  ];

  return (
    <>
      <PageHeader title="Kârlılık ve stok analizi" desc="Kâr, mağazadaki alış fiyatından hesaplanır; komisyon, kargo ve vergi dahil değildir. İptal ve taslak siparişler hariç." />
      <form className="card mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">Başlangıç</span><input className="input" type="date" name="baslangic" defaultValue={day(a.aralik.baslangic)} max={today} /></label>
        <label className="block"><span className="label">Bitiş</span><input className="input" type="date" name="bitis" defaultValue={day(a.aralik.bitis)} max={today} /></label>
        <label className="block"><span className="label">Hedef stok süresi (gün)</span><input className="input w-28" name="hedef" inputMode="numeric" defaultValue={cover} /></label>
        <button className="btn">Uygula</button>
        <div className="flex flex-wrap gap-1">{PRESETS.map((n) => <Link key={n} href={preset(n)} className="btn-ghost">{n === 365 ? "1 yıl" : `${n} gün`}</Link>)}</div>
      </form>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map(([k, v, note]) => (
          <div key={k} className="card">
            <div className="text-sm text-gray-500">{k}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{v}</div>
            {note && <div className="mt-1 text-xs text-amber-700">{note}</div>}
          </div>
        ))}
      </div>

      <section className="card mt-5">
        <h2 className="font-semibold">Mağaza bazlı ciro</h2>
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
        <Table title="En çok kazandıranlar" hint="Yalnızca alış fiyatı tanımlı ürünler" rows={a.enCokKazandiran} money={money} cols={["adet", "kar", "marj"]} />
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
