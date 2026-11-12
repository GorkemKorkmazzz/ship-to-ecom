import { syncNow } from "@/app/actions";

export function Flash({ ok, hata }: { ok?: string; hata?: string }) {
  if (!ok && !hata) return null;
  return (
    <p className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${hata ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
      {hata ?? ok}
    </p>
  );
}

export function SyncButton({ path }: { path: string }) {
  return (
    <form action={syncNow}>
      <input type="hidden" name="path" value={path} />
      <button className="btn">Şimdi senkronize et</button>
    </form>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-0.5 text-sm text-gray-500">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

const STORE_COLORS = ["bg-sky-100 text-sky-700", "bg-amber-100 text-amber-800"];
export const STORE_HEX = ["#0284c7", "#f59e0b"];
export function StoreBadge({ label, index }: { label: string; index: number }) {
  return <span className={`badge ${STORE_COLORS[index % 2]}`}>{label}</span>;
}

export const fmtDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export const fmtMoney = (n: number, currency: string) => {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000);
