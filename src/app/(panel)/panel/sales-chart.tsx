"use client";

import { useState } from "react";

type Pair = { now: number[]; prev: number[] };
const METRICS = [["ciro", "Ciro"], ["siparis", "Sipariş"], ["urun", "Ürün"]] as const;
type Key = (typeof METRICS)[number][0];

const nice = (max: number) => {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max)) / 10;
  return [1, 2, 2.5, 5, 10, 20, 25].find((m) => m * pow * 3 >= max)! * pow * 3;
};
const label = (d: string, long: boolean) =>
  new Intl.DateTimeFormat("tr-TR", long ? { day: "numeric", month: "short", timeZone: "Europe/Istanbul" } : { weekday: "short", timeZone: "Europe/Istanbul" }).format(new Date(`${d}T12:00:00+03:00`));

/** Satış analizi: bu dönem ile önceki eş dönemi karşılaştırır; üzerine gelince gün değeri görünür. */
export function SalesChart({ days, daily, currency }: { days: string[]; daily: Record<Key, Pair>; currency: string }) {
  const [metric, setMetric] = useState<Key>("ciro");
  const [hover, setHover] = useState<number | null>(null);
  const { now, prev } = daily[metric];
  const fmt = (n: number) =>
    metric === "ciro" ? new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n) : new Intl.NumberFormat("tr-TR").format(n);

  const W = 900, H = 320, L = 72, R = 16, T = 16, B = 34;
  const top = nice(Math.max(0, ...now, ...prev));
  const x = (i: number) => L + (days.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const every = Math.ceil(days.length / 6);
  const long = days.length > 7;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-indigo-600" />Bu dönem</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-indigo-300" />Önceki dönem</span>
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Grafik ölçüsü">
          {METRICS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={metric === k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1 text-sm font-medium ${metric === k ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-label={`Günlük ${METRICS.find((m) => m[0] === metric)![1].toLocaleLowerCase("tr")} grafiği`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#4f46e5" stopOpacity="0.18" /><stop offset="100%" stopColor="#4f46e5" stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 1, 2, 3].map((k) => {
            const v = (top * k) / 3;
            return (
              <g key={k}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#eef0f3" />
                <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#9ca3af">{fmt(v)}</text>
              </g>
            );
          })}
          {days.map((d, i) => (i % every === 0 || i === days.length - 1) && (
            <text key={d} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#9ca3af">{label(d, long)}</text>
          ))}
          <path d={`${path(now)} L${x(now.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#fill)" />
          <path d={path(prev)} fill="none" stroke="#a5b4fc" strokeWidth="2" strokeDasharray="5 5" />
          <path d={path(now)} fill="none" stroke="#4f46e5" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#c7d2fe" />
              <circle cx={x(hover)} cy={y(now[hover])} r="5" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 70px), calc(100% - 150px))` }}>
            <div className="text-gray-500">{label(days[hover], true)}</div>
            <div className="text-sm font-semibold text-gray-900">{fmt(now[hover])}</div>
            <div className="text-gray-400">Önceki: {fmt(prev[hover] ?? 0)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
