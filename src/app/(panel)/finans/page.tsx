import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { parseAdRange } from "@/lib/ads/report";
import { buildFinanceDashboard } from "@/lib/finance/dashboard";
import { requireUser } from "@/lib/session";
import { Thumb } from "../thumb";
import { Donut, IncomeChart, Sparkline, Tabs } from "./charts";
import { FinanceBg, FinanceShell, finLink, type FinParams } from "./shell";
import { CardTitle, Change, ChannelMark, Empty, I, card, fmtMoneyFn, fmtNum, fmtPct } from "./ui";

const LEVEL: Record<string, [string, string, string]> = {
  kritik: ["Kritik", "bg-red-50 text-red-600", "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"],
  onemli: ["Önemli", "bg-orange-50 text-orange-600", "M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4"],
  firsat: ["Fırsat", "bg-blue-50 text-blue-600", "M3 17l6-6 4 4 8-8M15 7h6v6"],
  bilgi: ["Bilgi", "bg-indigo-50 text-indigo-600", "M12 16v-4M12 8h.01M12 3a9 9 0 100 18 9 9 0 000-18z"],
};

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const range = parseAdRange(sp.gun, sp.baslangic, sp.bitis);
  const d = await buildFinanceDashboard(user.id, range, { storeId: sp.magaza, channel: sp.kanal, currency: sp.para, compare: sp.karsilastir !== "0" });
  const money = fmtMoneyFn(d.currency), money0 = fmtMoneyFn(d.currency, 0);
  const k = d.kpis, s = d.series;
  const kpis = [
    { label: "Toplam Ciro", value: money(k.revenue.value), change: k.revenue.change, spark: s.map((x) => x.revenue), color: "#633BFF", bg: "bg-[#F1EDFF] text-[#633BFF]", icon: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01" },
    { label: "Net Satış", value: money(k.net.value), change: k.net.change, spark: s.map((x) => x.net), color: "#10B981", bg: "bg-emerald-50 text-emerald-600", icon: "M3 7h18v12H3zM3 11h18M16 15h2" },
    { label: "Brüt Kâr", value: money(k.gross.value), change: k.gross.change, spark: s.map((x) => x.gross), color: "#F59E0B", bg: "bg-amber-50 text-amber-600", icon: "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6", partial: k.gross.state === "partial" },
    { label: "Katkı Kârı", value: k.contribution.value === null ? "Hesaplanamaz" : money(k.contribution.value), change: k.contribution.change, spark: s.map((x) => x.contribution), color: "#3B82F6", bg: "bg-blue-50 text-blue-600", icon: "M3 17l6-6 4 4 8-8M15 7h6v6", partial: k.contribution.state === "partial", hint: k.contribution.note },
    { label: "Reklam Harcaması", value: k.ads.value === null ? "Veri yok" : money(k.ads.value), change: k.ads.change, spark: s.map((x) => x.ad), color: "#22C55E", bg: "bg-green-50 text-green-600", icon: "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 11-5.8-1.6", invert: true },
    { label: "Kâr Marjı", value: fmtPct(k.margin.value), change: k.margin.change, spark: s.map((x) => (x.net ? ((x.contribution ?? x.gross) / x.net) * 100 : null)), color: "#8B5CF6", bg: "bg-violet-50 text-violet-600", icon: "M19 5L5 19M6.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM17.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5z", pp: true, hint: `${k.margin.basis === "katkı" ? "Katkı" : "Brüt"} kâr / net satış` },
  ];
  const levelOrder = { kritik: 0, onemli: 1, firsat: 2, bilgi: 3 } as const;

  return (
    <FinanceBg>
      <FinanceShell base="/finans" title="Finans Merkezi" desc="İşletmenizin tüm finansal verilerini tek ekranda görüntüleyin" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      {!d.hasData && <div className="mb-5"><Empty text="Seçili filtrede sipariş yok. Tarih, mağaza ya da kanal filtresini değiştirin." /></div>}

      {/* 1. satır: 6 KPI kartı */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6 [&>*]:min-w-0">
        {kpis.map((x) => (
          <div key={x.label} className={`${card} flex flex-col p-4`} title={x.hint}>
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${x.bg}`}><I d={x.icon} className="h-[18px] w-[18px]" /></span>
              <span className="truncate text-[13px] font-medium text-gray-600">{x.label}</span>
            </div>
            <div className={`mt-3 truncate font-bold tabular-nums tracking-tight text-[#1E1B4B] ${/\d/.test(x.value) ? "text-[22px]" : "text-base text-gray-500"}`}>{x.value}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><Change v={x.change} invert={x.invert} pp={x.pp} />{x.partial && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">eksik veri</span>}</div>
            <div className="mt-auto pt-2"><Sparkline values={x.spark} color={x.color} /></div>
          </div>
        ))}
      </div>

      {/* 2. satır: gelir-gider grafiği + kâr dağılımı (donut) */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <section className={`${card} p-5 lg:col-span-2`}>
          <CardTitle icon={<I d="M3 17l5-5 4 4 8-8" />} title="Gelir ve Gider Analizi" />
          <div className="mt-3"><IncomeChart data={d.series} currency={d.currency} /></div>
          <p className="mt-2 text-[11px] text-gray-400">Toplam gider = ürün maliyeti + kayıtlı satış giderleri + reklam harcaması. Katkı kârı (grafik) = net satış − toplam gider; maliyeti eksik günlerde çizilmez.</p>
        </section>
        <section className={`${card} p-5`}>
          <CardTitle icon={<I d="M12 3a9 9 0 109 9h-9z M14 3.3A9 9 0 0120.7 10H14z" />} title="Kâr Dağılımı" />
          {d.partsTotal > 0 ? (
            <div className="mt-4 grid items-center gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Donut parts={d.parts} total={d.partsTotal} center={money0(d.partsTotal)} sub="Toplam Gider" />
              <ul className="space-y-3">
                {d.parts.map((p) => (
                  <li key={p.key} className="flex items-start gap-2.5">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2 text-[13px] text-gray-600"><span className="truncate">{p.label}</span></div>
                      <div className="flex justify-between gap-2 text-[13px]">
                        <span className="font-semibold text-[#1E1B4B]">{p.value === null ? "—" : fmtPct((p.value / d.partsTotal) * 100)}</span>
                        <span className="font-semibold tabular-nums text-[#1E1B4B]">{p.value === null ? <span className="font-normal text-gray-400">veri yok</span> : money0(p.value)}</span>
                      </div>
                      {p.note && p.value !== null && <div className="text-[11px] text-gray-400">{p.note}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : <div className="mt-4"><Empty text="Bu dönemde gider verisi yok." /></div>}
        </section>
      </div>

      {/* 3. satır: satış kanalı performansı + stok ve sermaye */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <section className={`${card} overflow-hidden lg:col-span-2`}>
          <div className="px-5 pt-5"><CardTitle icon={<I d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />} title="Satış Kanalı Performansı" /></div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-[12.5px]">
              <thead className="bg-[#FAFAFD] text-left text-xs font-medium text-gray-500"><tr>{["Kanal", "Sipariş Sayısı", "Net Satış", "Ürün Maliyeti", "Komisyon", "Kargo", "Reklam Gideri", "Katkı Kârı", "Kâr Marjı"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-[#F1F0F7]">
                {d.channels.map((c) => (
                  <tr key={c.key}>
                    <td className="px-3 py-2.5"><span className="flex items-center gap-2.5 font-semibold text-[#1E1B4B]"><ChannelMark k={c.key} />{c.label}</span></td>
                    {c.orders ? <>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(c.orders)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money0(c.net)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{money0(c.cost)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.commission == null ? "-" : money0(c.commission)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.shipping == null ? "-" : money0(c.shipping)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{c.ads == null ? "-" : money0(c.ads)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{c.contribution == null ? <span className="font-normal text-gray-400">hesaplanamaz</span> : money0(c.contribution)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(c.margin)}</td>
                    </> : <td colSpan={8} className="px-3 py-2.5 text-xs text-gray-400">{c.connected ? "Bu dönemde sipariş yok" : "Entegrasyon bağlı değil — veri yok"}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 pb-4 pt-2 text-[11px] text-gray-400">Komisyon: pazaryeri + ödeme kuruluşu komisyonu; kargo: kargo + iade kargo gideri (kayıtlı olanlar). Reklam gideri kanal kırılımı olmadığından bağlı tek kanala yazılır; katkı kârı reklam dahildir.</p>
        </section>
        <section className={`${card} p-5`}>
          <CardTitle icon={<I d="M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10" />} title="Stok ve Sermaye Analizi" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ["Toplam Stok", `${fmtNum(d.stock.units)} Adet`, "bg-orange-50 text-orange-500", "M4 7l8-4 8 4v10l-8 4-8-4V7z"],
              ["Stok Değeri", money0(d.stock.value), "bg-amber-50 text-amber-500", "M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6"],
              ["Kritik Stok", `${fmtNum(d.stock.critical)} Ürün`, "bg-red-50 text-red-500", "M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"],
              ["Tahmini Süre", d.stock.days === null ? "Satış yok" : `${fmtNum(d.stock.days)} Gün`, "bg-blue-50 text-blue-500", "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"],
            ].map(([l, v, c, ic]) => (
              <div key={l} className="flex items-center gap-2.5 rounded-xl border border-[#F1F0F7] p-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c}`}><I d={ic} className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0"><div className="text-[11px] text-gray-500">{l}</div><div className="truncate text-[15px] font-bold tabular-nums text-[#1E1B4B]">{v}</div></div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[13px]"><span className="font-semibold text-[#1E1B4B]">Stokta Bağlı Sermaye</span><span className="font-bold tabular-nums text-[#1E1B4B]">{money0(d.stock.value)}</span></div>
            <div className="mt-2 h-2 rounded-full bg-[#F1EDFF]"><div className="h-2 rounded-full bg-[#633BFF]" style={{ width: `${Math.max(2, d.stock.costKnownShare ?? 0)}%` }} /></div>
            <p className="mt-1.5 text-[11px] text-gray-400">Çubuk: maliyeti bilinen stok oranı ({fmtPct(d.stock.costKnownShare, 0)}).{d.stock.unknownUnits ? ` Maliyeti bilinmeyen ${fmtNum(d.stock.unknownUnits)} adet değere katılmadı.` : ""}</p>
          </div>
        </section>
      </div>

      {/* 4. satır: ürün kârlılığı + finansal uyarılar + özet değerlendirme */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12 [&>*]:min-w-0">
        <section className={`${card} p-5 lg:col-span-12 xl:col-span-5`}>
          <CardTitle icon={<I d="M3 17l5-5 4 4 8-8" />} title="Ürün Kârlılığı – En İyi ve En Zayıf Ürünler" />
          <div className="mt-3">
            <Tabs tabs={[["k", "En Çok Kazandıranlar"], ["s", "En Çok Satanlar"], ["d", "Düşük Marjlılar"], ["z", "Zararda Olanlar"]]}>
              {[d.productTabs.kazandiran, d.productTabs.satan, d.productTabs.dusukMarj, d.productTabs.zarar].map((rows, n) => (
                <div key={n} className="overflow-x-auto">
                  {rows.length ? (
                    <table className="w-full text-[12px]">
                      <thead className="text-left text-[11px] text-gray-500"><tr>{["Ürün", "Satış Adedi", "Net Ciro", "Maliyet", "Brüt Kâr", "Marj"].map((h, i) => <th key={h} className={`whitespace-nowrap py-2 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-[#F1F0F7]">
                        {rows.slice(0, 5).map((p) => (
                          <tr key={p.sku}>
                            <td className="py-2 pr-2"><span className="flex items-center gap-2"><Thumb src={p.image} alt={p.ad} size={28} /><span className="max-w-[120px] truncate font-medium text-[#1E1B4B] 2xl:max-w-[180px]" title={p.ad}>{p.ad}</span></span></td>
                            <td className="py-2 text-right tabular-nums">{fmtNum(p.adet)}</td>
                            <td className="py-2 text-right tabular-nums">{money0(p.ciro)}</td>
                            <td className="py-2 text-right tabular-nums">{p.maliyet === null ? <span className="text-gray-400">eksik</span> : money0(p.maliyet)}</td>
                            <td className={`py-2 text-right tabular-nums ${p.kar !== null && p.kar < 0 ? "text-red-600" : ""}`}>{p.kar === null ? "—" : money0(p.kar)}</td>
                            <td className="py-2 text-right tabular-nums">{p.marj === null ? "—" : fmtPct(p.marj)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <Empty text={n === 3 ? "Zararda olan ürün yok." : "Bu sekmede gösterilecek ürün yok."} />}
                </div>
              ))}
            </Tabs>
          </div>
        </section>

        <section className={`${card} p-5 lg:col-span-7 xl:col-span-4`}>
          <CardTitle icon={<I d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />} title="Finansal Uyarılar" right={<Link href={finLink("/finans/gelir-gider", sp)} className="text-xs font-semibold text-[#633BFF] hover:underline">Tümünü Gör →</Link>} />
          <ul className="mt-3 space-y-2.5">
            {[...d.alerts].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]).slice(0, 5).map((a) => (
              <li key={a.text}>
                <Link href={a.href} className="flex items-start gap-2.5 rounded-lg p-1 hover:bg-[#FAFAFD]">
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${LEVEL[a.level][1]}`}><I d={LEVEL[a.level][2]} className="h-3.5 w-3.5" />{LEVEL[a.level][0]}</span>
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#1E1B4B]">{a.text}</span>
                  <span className="shrink-0 text-[11px] text-gray-400">{d.lastSync ? ago(d.lastSync) : "şimdi"}</span>
                </Link>
              </li>
            ))}
            {!d.alerts.length && <li><Empty text="Şu an finansal uyarı yok." /></li>}
          </ul>
        </section>

        <section className="relative overflow-hidden rounded-2xl border border-[#E4DDFF] bg-gradient-to-br from-[#F1EDFF] via-[#EEE9FF] to-[#E4DBFF] p-5 lg:col-span-5 xl:col-span-3">
          <svg viewBox="0 0 120 100" className="pointer-events-none absolute -right-3 top-2 h-20 w-24 opacity-90" aria-hidden>
            <circle cx="70" cy="50" r="44" fill="#fff" opacity="0.5" />
            <rect x="40" y="58" width="12" height="26" rx="3" fill="#633BFF" opacity="0.55" /><rect x="58" y="46" width="12" height="38" rx="3" fill="#633BFF" opacity="0.7" /><rect x="76" y="34" width="12" height="50" rx="3" fill="#633BFF" opacity="0.85" /><rect x="94" y="22" width="12" height="62" rx="3" fill="#633BFF" />
            <path d="M36 50 L58 36 L76 40 L104 14" fill="none" stroke="#633BFF" strokeWidth="3" strokeLinecap="round" /><path d="M96 12 L106 12 L106 22" fill="none" stroke="#633BFF" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-[#633BFF]"><I d="M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01" /></span>
          <h2 className="mt-3 pr-16 text-lg font-bold text-[#1E1B4B]">Özet Değerlendirme</h2>
          <div className="mt-2 space-y-1 pr-6 text-[13px] leading-relaxed text-[#3B3660]">{d.summary.length ? d.summary.map((t) => <p key={t}>{t}</p>) : <p>Bu dönem için değerlendirme yapılacak veri yok.</p>}</div>
          <Link href={finLink("/finans/gelir-gider", sp)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#633BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-[#5430E0]">Detaylı Analiz Gör →</Link>
        </section>
      </div>
    </FinanceBg>
  );
}

function ago(d: Date) {
  const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  return m < 1 ? "şimdi" : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.round(m / 60)} saat önce` : `${Math.round(m / 1440)} gün önce`;
}
