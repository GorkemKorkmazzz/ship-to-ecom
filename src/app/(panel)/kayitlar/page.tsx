import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtDate } from "../ui";

const LEVEL: Record<string, string> = {
  info: "bg-gray-100 text-gray-700",
  warn: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-700",
};

export default async function Page() {
  const user = await requireUser();
  const logs = await db.syncLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <>
      <PageHeader title="Kayıtlar" desc="Stok değişiklikleri ve senkron hataları (son 200)" />
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="th">Zaman</th>
              <th className="th">Tür</th>
              <th className="th">SKU</th>
              <th className="th">Mağaza</th>
              <th className="th">Açıklama</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="td whitespace-nowrap text-gray-600">{fmtDate(l.createdAt)}</td>
                <td className="td"><span className={`badge ${LEVEL[l.level] ?? LEVEL.info}`}>{l.level}</span></td>
                <td className="td whitespace-nowrap font-mono text-xs">{l.sku ?? "—"}</td>
                <td className="td">{l.storeLabel ?? "—"}</td>
                <td className="td">{l.message}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr><td className="td py-8 text-center text-gray-500" colSpan={5}>Henüz kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
