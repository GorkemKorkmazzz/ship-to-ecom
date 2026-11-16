/**
 * Tek metrik çizgi grafiği: seçili dönem (dolu çizgi) ve önceki dönem (kesikli). null = veri yok (çizgi kesilir, sıfır gibi çizilmez).
 * Sunucu bileşeni, kütüphanesiz SVG.
 */
export function MetricChart({ title, days, current, previous, format, color = "#4f46e5", uncovered }: {
  title: string; days: string[]; current: (number | null)[]; previous?: (number | null)[]; format: (v: number) => string; color?: string;
  /** Senkron kapsamı dışındaki günler ("veri yok"). Verilmezse null değerler veri yok sayılır. Oranlarda null "hesaplanamaz" olabilir. */
  uncovered?: boolean[];
}) {
  const W = 320, H = 120, P = 6;
  const vals = [...current, ...(previous ?? [])].filter((v): v is number => v !== null);
  const max = Math.max(...vals, 0) || 1;
  const x = (i: number) => P + (i / Math.max(1, days.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = (arr: (number | null)[]) => {
    let d = "", pen = false;
    arr.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };
  const sum = (arr: (number | null)[]) => arr.reduce<number | null>((a, v) => (v === null ? a : (a ?? 0) + v), null);
  const cur = sum(current), prv = previous ? sum(previous) : null;
  const missing = uncovered ? uncovered.filter(Boolean).length : current.filter((v) => v === null).length;
  return (
    <figure className="card min-w-0 p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        <span className="text-xs text-gray-400">{missing ? `${missing} gün veri yok` : ""}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-28 w-full" role="img" aria-label={`${title} günlük grafik`} preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#e5e7eb" />
        {previous && <path d={path(previous)} fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />}
        <path d={path(current)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-gray-400"><span>{days[0]}</span><span>{days[days.length - 1]}</span></div>
      {cur !== null && (
        <p className="mt-1 text-xs text-gray-500">
          <span className="inline-block h-0.5 w-3 align-middle" style={{ background: color }} /> Bu dönem en yüksek: {format(Math.max(...current.filter((v): v is number => v !== null), 0))}
          {previous && prv !== null && <> · <span className="inline-block w-3 border-t border-dashed border-gray-400 align-middle" /> önceki dönem</>}
        </p>
      )}
    </figure>
  );
}
