// Günlük satış çizgi grafiği (sunucuda çizilen SVG).
export type Series = { label: string; color: string; values: number[] };

const nice = (max: number) => {
  if (max <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(max)) / 10;
  const step = [1, 2, 2.5, 5, 10, 20, 25].find((m) => m * pow * 4 >= max)! * pow;
  return step * 4;
};

export function SalesChart({ days, series, fmt }: { days: string[]; series: Series[]; fmt: (n: number) => string }) {
  const W = 900, H = 300, L = 64, R = 16, T = 12, B = 32;
  const top = nice(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => L + (days.length === 1 ? 0 : (i * (W - L - R)) / (days.length - 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const every = Math.ceil(days.length / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Günlük satış grafiği">
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (top * k) / 4;
        return (
          <g key={k}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="1" />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="12" fill="#6b7280">{fmt(v)}</text>
          </g>
        );
      })}
      {days.map((d, i) =>
        i % every === 0 ? (
          <text key={d} x={x(i)} y={H - 8} textAnchor="middle" fontSize="12" fill="#6b7280">{d}</text>
        ) : null,
      )}
      {series.map((s, si) => (
        <g key={si}>
          <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          {s.values.map((v, i) => (
            <circle key={i} cx={x(i)} cy={y(v)} r={v > 0 ? 3.5 : 0} fill={s.color}>
              <title>{`${s.label} · ${days[i]}: ${fmt(v)}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  );
}
