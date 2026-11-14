import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import { getStores } from "@/lib/cache";
import { ACTIONS, FIELDS, OPS, RULE_SLOTS as SLOTS, parse, type Action, type Condition } from "@/lib/automation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader, fmtDate } from "../ui";
import { createRule, deleteRule, toggleRule } from "./actions";

const KINDS = Object.entries(FIELDS).flatMap(([f, d]) => d.ops.map((op) => ({ value: `${f}:${op}`, label: d.ops.length > 1 ? `${d.label} ${OPS[op]}` : d.label })));
const ACTION_HINT: Record<string, string> = { etiket: "Etiket (ör. Büyük sipariş)", bildirim: "Bildirim metni", stok_kontrol: "Eşik adet (ör. 5)" };

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "otomasyon")) return <Locked moduleId="otomasyon" />;
  const sp = await searchParams;
  const [stores, rules] = await Promise.all([getStores(user.id), db.automationRule.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } })]);
  const storeName = (id: string) => stores.find((s) => s.id === id)?.label ?? "silinmiş mağaza";
  const describe = (c: Condition) => {
    const f = FIELDS[c.field];
    if (!f) return "?";
    const v = c.field === "magaza" ? storeName(c.value) : c.value;
    return `${f.label} ${c.op === "eq" ? "=" : c.op === "gte" ? "≥" : "≤"} ${v}`;
  };

  return (
    <>
      <PageHeader title="Sipariş otomasyonu" desc="Koşullar sağlanınca siparişe etiket eklenir, bildirim gönderilir ya da stok kontrol edilir. Her kural bir siparişte yalnızca bir kez çalışır." />
      <Flash ok={sp.ok} hata={sp.hata} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
          {rules.map((r) => {
            const conditions = parse<Condition>(r.conditions);
            const actions = parse<Action>(r.actions);
            return (
              <section key={r.id} className={`card ${r.active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{r.name}</h2>
                    <p className="text-xs text-gray-500">{r.runCount} kez çalıştı · son: {fmtDate(r.lastRunAt)} · oluşturma: {fmtDate(r.createdAt)}</p>
                  </div>
                  <span className={`badge ${r.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{r.active ? "Aktif" : "Pasif"}</span>
                </div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Koşullar (hepsi)</div>
                    <ul className="mt-1 space-y-1">{conditions.map((c, i) => <li key={i} className="rounded-md bg-gray-50 px-2 py-1">{describe(c)}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Aksiyonlar</div>
                    <ul className="mt-1 space-y-1">{actions.map((a, i) => <li key={i} className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-900">{ACTIONS[a.type] ?? a.type}: {a.value}</li>)}</ul>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <form action={toggleRule}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost">{r.active ? "Pasif yap" : "Aktif yap"}</button></form>
                  <form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="btn-ghost text-red-600">Sil</button></form>
                </div>
              </section>
            );
          })}
          {!rules.length && <div className="card py-10 text-center text-sm text-gray-500">Henüz kural yok. Sağdaki formdan ilk kuralınızı oluşturun.</div>}
        </div>

        <form action={createRule} className="card space-y-4 lg:col-span-2">
          <h2 className="font-semibold">Yeni kural</h2>
          <label className="block">
            <span className="label">Kural adı *</span>
            <input className="input" name="name" required maxLength={80} placeholder="Örn. 1.000 TL üstü siparişler" />
          </label>
          <fieldset className="space-y-2">
            <legend className="label">Koşullar (tümü sağlanmalı)</legend>
            {Array.from({ length: SLOTS }, (_, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem] gap-2">
                <select className="input" name={`c${i}_kind`} defaultValue={i === 0 ? "tutar:gte" : ""} aria-label={`Koşul ${i + 1}`}>
                  <option value="">{i === 0 ? "Seçin" : "— (kullanma)"}</option>
                  {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <input className="input" name={`c${i}_value`} placeholder="Değer" aria-label={`Koşul ${i + 1} değeri`} />
                <select className="input col-span-2" name={`c${i}_store`} defaultValue="" aria-label={`Koşul ${i + 1} mağazası (yalnızca Mağaza koşulunda)`}>
                  <option value="">Mağaza koşulu için mağaza seçin</option>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            ))}
            <p className="text-xs text-gray-500">Durum için ikas değeri yazın, ör. <code>CANCELLED</code>, <code>PAID</code>, <code>UNFULFILLED</code>. Ürün için SKU yazın.</p>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="label">Aksiyonlar</legend>
            {Array.from({ length: SLOTS }, (_, i) => (
              <div key={i} className="grid grid-cols-[10rem_1fr] gap-2">
                <select className="input" name={`a${i}_type`} defaultValue={i === 0 ? "etiket" : ""} aria-label={`Aksiyon ${i + 1}`}>
                  <option value="">{i === 0 ? "Seçin" : "— (kullanma)"}</option>
                  {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input className="input" name={`a${i}_value`} placeholder={Object.values(ACTION_HINT).join(" / ")} aria-label={`Aksiyon ${i + 1} değeri`} />
              </div>
            ))}
            <ul className="text-xs text-gray-500">{Object.entries(ACTION_HINT).map(([k, v]) => <li key={k}>{ACTIONS[k as keyof typeof ACTIONS]}: {v}</li>)}</ul>
          </fieldset>
          <button className="btn w-full">Kuralı oluştur</button>
          <p className="text-xs text-gray-500">Kural, oluşturulduktan sonra verilen siparişlere senkron sırasında uygulanır. Etiketler yalnızca bu panelde görünür; mağazaya yazılmaz.</p>
        </form>
      </div>
    </>
  );
}
