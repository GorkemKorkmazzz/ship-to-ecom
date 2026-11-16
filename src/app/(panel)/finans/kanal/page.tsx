import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { loadFinance } from "../load";
import { FinanceBg, FinanceShell, type FinParams } from "../shell";
import { CardTitle, ChannelMark, I, card, fmtMoneyFn, fmtNum, fmtPct } from "../ui";

export default async function Page({ searchParams }: { searchParams: Promise<FinParams> }) {
  const user = await requireUser();
  if (!hasModule(user, "karlilik")) return <Locked moduleId="karlilik" />;
  const sp = await searchParams;
  const { range, d } = await loadFinance(user.id, sp);
  const money = fmtMoneyFn(d.currency);
  return (
    <FinanceBg>
      <FinanceShell base="/finans/kanal" title="Satış Kanalı Kârlılığı" desc="Her satış kanalının sipariş, maliyet, komisyon, kargo, reklam ve katkı kârı" sp={sp} range={range} stores={d.stores} currencies={d.currencies} currency={d.currency} demo={d.demo} lastSync={d.lastSync} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 [&>*]:min-w-0">
        {d.channels.map((c) => (
          <section key={c.key} className={`${card} p-5`}>
            <div className="flex items-center gap-2.5"><ChannelMark k={c.key} /><h2 className="font-semibold text-[#1E1B4B]">{c.label}</h2>
              <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${c.orders ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{c.orders ? "Aktif" : c.connected ? "Sipariş yok" : "Bağlı değil"}</span></div>
            {c.orders ? (
              <dl className="mt-4 space-y-1.5 text-[13px]">
                {([["Sipariş", fmtNum(c.orders)], ["Net satış", money(c.net)], ["Ürün maliyeti", money(c.cost)], ["Komisyon", c.commission == null ? "kayıt yok" : money(c.commission)], ["Kargo", c.shipping == null ? "kayıt yok" : money(c.shipping)], ["Reklam", c.ads == null ? "veri yok" : money(c.ads)]] as const).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-gray-500">{k}</dt><dd className="font-medium tabular-nums text-[#1E1B4B]">{v}</dd></div>)}
                <div className="flex justify-between gap-2 border-t border-[#F1F0F7] pt-2"><dt className="font-semibold text-[#1E1B4B]">Katkı kârı</dt><dd className="font-bold tabular-nums text-[#1E1B4B]">{c.contribution == null ? <span className="font-normal text-gray-400">hesaplanamaz</span> : money(c.contribution)}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-gray-500">Kâr marjı</dt><dd className="font-semibold tabular-nums">{fmtPct(c.margin)}</dd></div>
              </dl>
            ) : <p className="mt-4 text-[13px] text-gray-500">{c.connected ? "Bu dönemde sipariş yok." : "Bu kanalın entegrasyonu henüz yok; veri gösterilmez."}</p>}
          </section>
        ))}
      </div>
      <section className={`${card} mt-4 p-5`}>
        <CardTitle icon={<I d="M12 16v-4M12 8h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />} title="Hesaplama" />
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-gray-600">
          <li>Kanal, siparişin geldiği kaynaktır. Bugün yalnızca ikas mağazaları bağlanabildiği için diğer kanallarda veri yoktur; pazaryeri entegrasyonları aynı finans kayıt yapısını kullanacak.</li>
          <li>Komisyon: pazaryeri komisyonu + ödeme kuruluşu komisyonu; kargo: kargo + iade kargo gideri. Yalnızca kayıtlı giderler sayılır.</li>
          <li>Reklam harcamasının kanal kırılımı yoktur; tek kanal bağlıyken tamamı o kanala yazılır. Katkı kârı bu reklamı içerir.</li>
        </ul>
      </section>
    </FinanceBg>
  );
}
