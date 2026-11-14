"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toggleModule } from "./actions";

export type CardData = {
  key: string;
  name: string;
  text: string;
  icon: "megaphone" | "align" | "star" | "clock" | "gift" | "bell" | "bolt" | "tag" | "badge" | "eye" | "pointer" | "box" | "trophy";
  enabled: boolean;
  views: number;
  clicks: number;
};

// Satır içi ikonlar (lucide ile aynı çizgi stili; projede ikon paketi yok).
const ICONS: Record<CardData["icon"], string> = {
  megaphone: "M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM15 9a3 3 0 010 6M18 6a7 7 0 010 12",
  align: "M4 6h16M4 10h10M4 14h16M4 18h10",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2",
  gift: "M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2.5-4-7-2.5-5 0M12 7c2.5-4 7-2.5 5 0",
  bell: "M6 9a6 6 0 1112 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zM10 20a2 2 0 004 0",
  bolt: "M13 3L4 14h7l-1 7 9-11h-7l1-7z",
  tag: "M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9zM7.5 7.5h.01",
  badge: "M4 4h9l7 7-9 9-7-7V4zM8 8h.01M14 4l7 7",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z",
  pointer: "M9 9l11 4-5 2-2 5-4-11zM5 3v3M3 5h3M3.5 9.5l2-2M9.5 3.5l-2 2",
  box: "M4 7.5l8-4.5 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  trophy: "M8 4h8v5a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 13v4M8 21h8M10 17h4",
};
const Icon = ({ name, className = "h-5 w-5" }: { name: CardData["icon"]; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name]} />
  </svg>
);

/** Küçük trend çizgisi: gerçek günlük değerler. Tümü 0 ise düz çizgi (veri yok). */
function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 96, h = 32, max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${((i / Math.max(1, data.length - 1)) * w).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full max-w-24 shrink-0 sm:w-24" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Son 7 gün ile önceki 7 günün karşılaştırması. Önceki dönem 0 ise yüzde hesaplanmaz. */
function change(d: number[]) {
  const half = Math.floor(d.length / 2);
  const prev = d.slice(0, half).reduce((a, b) => a + b, 0), cur = d.slice(half).reduce((a, b) => a + b, 0);
  if (!prev) return cur ? { text: "yeni", dir: 1 } : { text: "%0", dir: 0 };
  const p = ((cur - prev) / prev) * 100;
  return { text: `%${Math.abs(p).toFixed(0)}`, dir: Math.sign(p) };
}

const nf = new Intl.NumberFormat("tr-TR");

function StatCard({ icon, tone, title, value, series, color, note }: { icon: CardData["icon"]; tone: string; title: string; value: string; series?: number[]; color: string; note?: string }) {
  const c = series ? change(series) : null;
  return (
    <div className="card flex min-w-0 items-start gap-3 !p-3 sm:!p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 ${tone}`}><Icon name={icon} className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-medium leading-snug text-slate-500 sm:text-sm">{title}</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-lg font-bold leading-tight text-gray-900 sm:text-2xl">{value}</p>
            {c && (
              <p className={`mt-0.5 text-xs font-medium ${c.dir > 0 ? "text-emerald-600" : c.dir < 0 ? "text-red-500" : "text-slate-400"}`}>
                {c.dir > 0 ? "↑" : c.dir < 0 ? "↓" : "→"} {c.text}
              </p>
            )}
            {note && <p className="mt-0.5 truncate text-xs text-slate-400">{note}</p>}
          </div>
          {series && <Spark data={series} color={color} />}
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ c, storeId }: { c: CardData; storeId: string }) {
  const rate = c.views ? `%${((c.clicks / c.views) * 100).toFixed(1)}` : "%0";
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.05)] transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 sm:h-16 sm:w-16"><Icon name={c.icon} className="h-6 w-6 sm:h-8 sm:w-8" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-gray-900">{c.name}</h3>
            {/* Durum rozeti aynı zamanda aç/kapat butonudur (mevcut toggleModule aksiyonu; ikas'a bağlı modüller orada eşitlenir). */}
            <form action={toggleModule}>
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="moduleKey" value={c.key} />
              <input type="hidden" name="enabled" value={c.enabled ? "0" : "1"} />
              <button
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${c.enabled ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                aria-label={`${c.name}: ${c.enabled ? "Aktif, pasif yapmak için tıklayın" : "Pasif, aktif yapmak için tıklayın"}`}
                title={c.enabled ? "Pasif yap" : "Aktif yap"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${c.enabled ? "bg-emerald-500" : "bg-gray-400"}`} />
                {c.enabled ? "Aktif" : "Pasif"}
              </button>
            </form>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{c.text}</p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-end gap-x-2 gap-y-3 pt-5">
        <dl className="grid min-w-0 basis-full grid-cols-3 divide-x divide-gray-100 xl:basis-0 xl:flex-1">
          {[
            ["Görüntülenme", nf.format(c.views), "eye"],
            ["Tıklanma", nf.format(c.clicks), "pointer"],
            ["Tıklanma Oranı", rate, null],
          ].map(([label, value, icon]) => (
            <div key={label} className="min-w-0 px-3 first:pl-0">
              <dd className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                {icon ? <Icon name={icon as CardData["icon"]} className="h-3.5 w-3.5 text-slate-400" /> : <span className="text-xs font-semibold text-slate-400">%</span>}
                {value}
              </dd>
              <dt className="mt-0.5 text-xs leading-tight text-slate-400">{label}</dt>
            </div>
          ))}
        </dl>
        <Link href={`/vitrin/${c.key}?magaza=${storeId}`} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-indigo-500 px-6 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-50 xl:w-auto">
          Ayarla <span aria-hidden>→</span>
        </Link>
      </div>
    </article>
  );
}

export function Dashboard(props: {
  stores: { id: string; label: string; host: string }[];
  storeId: string;
  cards: CardData[];
  views: number[];
  clicks: number[];
  active: number;
  top: string | null;
  storeCard: React.ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const query = q.trim().toLocaleLowerCase("tr");
  const shown = props.cards.filter((c) => !query || `${c.name} ${c.text}`.toLocaleLowerCase("tr").includes(query));
  const topCard = props.cards.find((c) => c.name === props.top);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-[28px]">Vitrin Modülleri</h1>
          <p className="mt-1 text-sm text-slate-500">Mağazanızın satış performansını artıracak vitrin modüllerini yönetin ve özelleştirin.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="sr-only" htmlFor="vitrin-magaza">Mağaza</label>
          <select
            id="vitrin-magaza"
            className="input !w-auto min-w-0 flex-1 sm:flex-none"
            value={props.storeId}
            onChange={(e) => start(() => router.push(`/vitrin?magaza=${e.target.value}`))}
          >
            {props.stores.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.host})</option>)}
          </select>
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <input className="input !pl-9" placeholder="Modül ara..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Modül ara" />
          </div>
          <button
            type="button"
            className="btn-ghost !h-[38px] !w-[38px] !p-0"
            onClick={() => start(() => router.refresh())}
            aria-label="Verileri yenile"
            title="Yenile"
          >
            <svg viewBox="0 0 24 24" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" /></svg>
          </button>
        </div>
      </div>

      {props.storeCard}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon="eye" tone="bg-indigo-50 text-indigo-600" title="Toplam Görüntülenme" value={nf.format(props.cards.reduce((a, c) => a + c.views, 0))} series={props.views} color="#6366f1" />
        <StatCard icon="pointer" tone="bg-sky-50 text-sky-600" title="Toplam Tıklanma" value={nf.format(props.cards.reduce((a, c) => a + c.clicks, 0))} series={props.clicks} color="#0ea5e9" />
        <StatCard icon="box" tone="bg-emerald-50 text-emerald-600" title="Aktif Modüller" value={String(props.active)} color="#10b981" note={`${props.cards.length} modülden`} />
        <StatCard
          icon="trophy"
          tone="bg-amber-50 text-amber-500"
          title="En Çok Etkileşim Alan Modül"
          value={props.top ?? "Henüz yok"}
          color="#f59e0b"
          note={topCard ? `${nf.format(topCard.views + topCard.clicks)} etkileşim · son 30 gün` : "Etkileşim verisi yok"}
        />
      </div>
      <p className="-mt-3 mb-5 text-xs text-slate-400">Sayılar bu mağazanın son 30 günü; trend çizgisi son 14 gün, yüzde son 7 günü önceki 7 günle karşılaştırır. Veriler mağazadaki vitrin betiğinden gelir.</p>

      {shown.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((c) => <ModuleCard key={c.key} c={c} storeId={props.storeId} />)}
        </div>
      ) : (
        <p className="card text-sm text-slate-500">&quot;{q}&quot; ile eşleşen modül yok.</p>
      )}
    </>
  );
}
