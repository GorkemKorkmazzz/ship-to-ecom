"use client";

import { useState } from "react";

type Series = { spend: number[]; value: number[]; clicks: number[]; impressions: number[]; purchases: number[] };
const METRICS = [["spend", "Harcama"], ["value", "Platform cirosu"], ["roas", "ROAS"], ["clicks", "Tıklama"]] as const;
type Key = (typeof METRICS)[number][0];
const LINES = [["total", "Toplam", "#4f46e5"], ["meta", "Meta", "#2563eb"], ["google", "Google Ads", "#f59e0b"]] as const;

const nice = (max: number) => {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max)) / 10;
  return [1, 2, 2.5, 5, 10, 20, 25].find((m) => m * pow * 3 >= max)! * pow * 3;
};

/** Günlük reklam performansı; Meta, Google ve toplam aynı grafikte karşılaştırılır. */
export function AdChart({ days, series, currency, providers }: { days: string[]; series: Record<"meta" | "google", Series>; currency: string; providers: ("meta" | "google")[] }) {
  const [metric, setMetric] = useState<Key>("spend");
  const [hover, setHover] = useState<number | null>(null);
  const pick = (p: "meta" | "google" | "total"): number[] => {
    const src = p === "total" ? null : series[p];
    const sum = (k: keyof Series) => days.map((_, i) => (src ? src[k][i] : series.meta[k][i] + series.google[k][i]));
    if (metric === "roas") {
      const s = sum("spend"), v = sum("value");
      return s.map((x, i) => (x ? Math.round((v[i] / x) * 100) / 100 : 0));
    }
    return sum(metric);
  };
  const lines = LINES.filter(([k]) => k === "total" || providers.includes(k)).map(([k, label, color]) => ({ k, label, color, values: pick(k) }));
  const fmt = (n: number) =>
    metric === "spend" || metric === "value" ? new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(n)
    : metric === "roas" ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(n) : new Intl.NumberFormat("tr-TR").format(n);

  const W = 900, H = 300, L = 72, R = 16, T = 16, B = 34;
  const top = nice(Math.max(0, ...lines.flatMap((l) => l.values)));
  const x = (i: number) => L + (days.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(days.length / 6);
  const label = (d: string) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-xs text-gray-500">
          {lines.map((l) => <span key={l.k} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: l.color }} />{l.label}</span>)}
        </div>
        <div className="flex flex-wrap rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Grafik ölçüsü">
          {METRICS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={metric === k} onClick={() => setMetric(k)} className={`rounded-md px-3 py-1 text-sm font-medium ${metric === k ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="relative mt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none" role="img" aria-label="Günlük reklam performansı grafiği"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.round(((((e.clientX - r.left) / r.width) * W - L) / (W - L - R)) * (days.length - 1));
            setHover(Math.max(0, Math.min(days.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}>
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              <line x1={L} x2={W - R} y1={y((top * k) / 3)} y2={y((top * k) / 3)} stroke="#eef0f3" />
              <text x={L - 10} y={y((top * k) / 3) + 4} textAnchor="end" fontSize="12" fill="#9ca3af">{fmt((top * k) / 3)}</text>
            </g>
          ))}
          {days.map((d, i) => (i % every === 0 || i === days.length - 1) && <text key={d} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#9ca3af">{label(d)}</text>)}
          {lines.map((l) => (
            <path key={l.k} d={l.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke={l.color} strokeWidth={l.k === "total" ? 2.5 : 1.8} strokeDasharray={l.k === "total" ? undefined : "0"} strokeLinejoin="round" />
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#c7d2fe" />}
          {hover !== null && lines.map((l) => <circle key={l.k} cx={x(hover)} cy={y(l.values[hover])} r="4" fill={l.color} stroke="#fff" strokeWidth="2" />)}
        </svg>
        {hover !== null && (
          <div className="pointer-events-none absolute top-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md" style={{ left: `clamp(0px, calc(${(x(hover) / W) * 100}% - 75px), calc(100% - 160px))` }}>
            <div className="text-gray-500">{label(days[hover])}</div>
            {lines.map((l) => <div key={l.k} className="flex justify-between gap-4"><span style={{ color: l.color }}>{l.label}</span><span className="font-semibold text-gray-900">{fmt(l.values[hover])}</span></div>)}
          </div>
        )}
      </div>
    </div>
  );
}
