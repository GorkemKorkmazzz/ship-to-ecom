import Link from "next/link";

// Finans Merkezi ortak görünüm parçaları (referans tasarım: beyaz kart, ince lila kenarlık, hafif gölge, mor vurgu).

export const card = "rounded-2xl border border-[#ECEAF5] bg-white shadow-[0_1px_3px_rgba(30,27,75,0.04)]";
export const fmtMoneyFn = (currency: string, digits = 2) => (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
export const fmtNum = (v: number | null, d = 0) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v));
export const fmtPct = (v: number | null, d = 1) => (v === null ? "—" : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v)}`);

/** Önceki döneme göre değişim rozeti. invert: artışın kötü olduğu ölçüler (gider). pp: yüzde puan. */
export function Change({ v, invert = false, pp = false }: { v: number | null; invert?: boolean; pp?: boolean }) {
  if (v === null) return <span className="text-xs text-gray-400">önceki dönem yok</span>;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
      <svg viewBox="0 0 24 24" className={`h-3 w-3 ${v < 0 ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M7 17L17 7M9 7h8v8" /></svg>
      {pp ? `${Math.abs(v).toFixed(1).replace(".", ",")} puan` : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(Math.abs(v))}`}
    </span>
  );
}

/** Kanal işareti (resmi logo yerine sade, tanınır rozet). */
export function ChannelMark({ k }: { k: string }) {
  const M: Record<string, [string, string, string]> = { IKAS: ["ik", "#1E5BFF", "#fff"], TRENDYOL: ["T", "#F27A1A", "#fff"], HEPSIBURADA: ["hb", "#FF6000", "#fff"], AMAZON: ["a", "#111827", "#FF9900"], N11: ["n11", "#5B2C83", "#fff"] };
  const [t, bg, fg] = M[k] ?? ["?", "#9CA3AF", "#fff"];
  return <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-extrabold" style={{ background: bg, color: fg }} aria-hidden>{t}</span>;
}

export function CardTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#1E1B4B]"><span className="text-[#633BFF]">{icon}</span>{title}</h2>
      {right}
    </div>
  );
}
export const I = ({ d, className = "h-5 w-5" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
);
export function Empty({ text, href, cta }: { text: string; href?: string; cta?: string }) {
  return <div className="rounded-xl border border-dashed border-[#E4E1F0] px-4 py-6 text-center text-sm text-gray-500">{text}{href && <> <Link href={href} className="font-medium text-[#633BFF] hover:underline">{cta}</Link></>}</div>;
}
