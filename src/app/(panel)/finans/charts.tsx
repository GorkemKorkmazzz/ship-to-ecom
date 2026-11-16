"use client";

import { useState } from "react";

// Finans Merkezi grafikleri (SVG; projede grafik kütüphanesi yok). Veriler sunucuda hesaplanır, burada yalnızca çizilir.

const nice = (max: number) => {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max)) / 10;
  return [1, 2, 2.5, 5, 10, 20, 25].find((m) => m * pow * 4 >= max)! * pow * 4;
};
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".0", "")}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`);

/** KPI kartındaki küçük alan grafiği. Değeri olmayan (null) noktalar boş geçilir. */
export function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const W = 200, H = 48;
  const vs = values.map((v) => v ?? null), nums = vs.filter((v): v is number => v !== null);
  if (nums.length < 2) return <div className="h-12" aria-hidden />;
  const min = Math.min(...nums), max = Math.max(...nums), span = max - min || 1;
  const x = (i: number) => (i * W) / (vs.length - 1), y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);
  const pts = vs.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const id = `sp-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Point = { day: string; net: number; totalCost: number; contribution: number | null };
const SERIES = [["net", "Net Satış", "#633BFF"], ["totalCost", "Toplam Gider", "#F59E0B"], ["contribution", "Katkı Kârı", "#10B981"]] as const;

/** Gelir ve gider analizi: günlük / haftalık / aylık. Toplama sunucunun günlük değerleri üzerinden yapılır (katkı, eksik günde boş). */
export function IncomeChart({ data, currency }: { data: Point[]; currency: string }) {
  const [mode, setMode] = useState<"d" | "w" | "m">("d");
  const [hover, setHover] = useState<number | null>(null);
  const groups: { label: string; net: number; totalCost: number; contribution: number | null }[] = [];
  const keyOf = (d: string) => (mode === "d" ? d : mode === "m" ? d.slice(0, 7) : (() => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); })());
  for (const p of data) {
    const k = keyOf(p.day), g = groups.find((x) => x.label === k);
    if (!g) groups.push({ label: k, net: p.net, totalCost: p.totalCost, contribution: p.contribution });
    else { g.net += p.net; g.totalCost += p.totalCost; g.contribution = g.contribution === null || p.contribution === null ? null : g.contribution + p.contribution; }
  }
  const fmtMoney = (n: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const lbl = (k: string) => mode === "m" ? new Intl.DateTimeFormat("tr-TR", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${k}-15T12:00:00Z`))
    : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T12:00:00Z`));
  const W = 760, H = 270, L = 48, R = 12, T = 12, B = 30;
  const all = groups.flatMap((g) => [g.net, g.totalCost, g.contribution ?? 0]);
  const top = nice(Math.max(0, ...all)), bottom = Math.min(0, ...all) < 0 ? -nice(-Math.min(...all)) / 2 : 0;
  const x = (i: number) => L + (groups.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (groups.length - 1));
  const y = (v: number) => T + (1 - (v - bottom) / (top - bottom)) * (H - T - B);
  const every = Math.max(1, Math.ceil(groups.length / 5));
  const path = (k: (typeof SERIES)[number][0]) => {
    let d = "", pen = false;
    groups.forEach((g, i) => { const v = g[k]; if (v === null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d;
  };
  const ticks = [0, 1, 2, 3, 4].map((k) => bottom + ((top - bottom) * k) / 4);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          {SERIES.map(([k, l, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>)}
        </div>
        <div className="flex rounded-lg bg-[#F4F2FF] p-0.5" role="tablist" aria-label="Zaman aralığı">
          {([["d", "Günlük"], ["w", "Haftalık"], ["m", "Aylık"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setHover(null); }}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${mode === k ? "bg-[#633BFF] text-white shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-label="Gelir ve gider grafiği"
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (groups.length - 1)); setHover(Math.max(0, Math.min(groups.length - 1, i))); }}
          onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#F1F0F7" /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#9CA3AF">{short(t)}</text></g>)}
          {groups.map((g, i) => (i % every === 0 || i === groups.length - 1) && <text key={g.label} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#9CA3AF">{lbl(g.label)}</text>)}
          {SERIES.map(([k, , c]) => <path key={k} d={path(k)} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#DDD6FE" />}
          {hover !== null && SERIES.map(([k, , c]) => groups[hover][k] !== null && <circle key={k} cx={x(hover)} cy={y(groups[hover][k]!)} r="4" fill={c} stroke="#fff" strokeWidth="2" />)}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 80px), calc(100% - 170px))` }}>
            <div className="mb-1 font-medium text-gray-500">{mode === "w" ? `${lbl(groups[hover].label)} haftası` : lbl(groups[hover].label)}</div>
            {SERIES.map(([k, l, c]) => <div key={k} className="flex justify-between gap-5"><span style={{ color: c }}>{l}</span><span className="font-semibold text-gray-900">{groups[hover][k] === null ? "eksik veri" : fmtMoney(groups[hover][k]!)}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Halka grafik (donut): dilimler toplam gidere oranlıdır; ortada seçili toplam. */
export function Donut({ parts, total, center, sub }: { parts: { key: string; value: number | null; color: string }[]; total: number; center: string; sub: string }) {
  const R = 70, S = 22, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label="Kâr dağılımı halka grafiği">
        <circle cx="90" cy="90" r={R} fill="none" stroke="#F1F0F7" strokeWidth={S} />
        {total > 0 && parts.filter((p) => (p.value ?? 0) > 0).map((p) => {
          const len = ((p.value ?? 0) / total) * C, off = acc;
          acc += len;
          return <circle key={p.key} cx="90" cy="90" r={R} fill="none" stroke={p.color} strokeWidth={S} strokeDasharray={`${Math.max(0, len - 1.5)} ${C}`} strokeDashoffset={-off} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-lg font-bold tabular-nums text-[#1E1B4B]">{center}</div>
        <div className="text-xs text-gray-500">{sub}</div>
      </div>
    </div>
  );
}

/** Ürün kârlılığı sekmeleri (veri sunucudan gelir). */
export function Tabs({ tabs, children }: { tabs: [string, string][]; children: React.ReactNode[] }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="flex flex-wrap gap-1" role="tablist">
        {tabs.map(([k, l], n) => (
          <button key={k} role="tab" aria-selected={i === n} onClick={() => setI(n)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${i === n ? "bg-[#F1EDFF] text-[#633BFF] ring-1 ring-[#633BFF]/30" : "text-gray-600 hover:bg-gray-50"}`}>{l}</button>
        ))}
      </div>
      <div className="mt-2">{children[i]}</div>
    </div>
  );
}
