import { db } from "@/lib/db";
import { accountStatus, monthlyValue } from "@/lib/plans";

export const STATUS: Record<string, [string, string]> = {
  odeme: ["Ödeyen", "bg-emerald-100 text-emerald-700"],
  deneme: ["Denemede", "bg-sky-100 text-sky-700"],
  "suresi-doldu": ["Süresi doldu", "bg-amber-100 text-amber-800"],
  askida: ["Askıda", "bg-red-100 text-red-700"],
};

/** Tüm müşteri hesapları, mağazaları ve sayılarıyla. */
export async function loadAccounts() {
  const now = new Date().getTime();
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: { stores: { include: { _count: { select: { variants: true, orders: true } } } }, _count: { select: { sharedItems: true } } },
  });
  const rows = users.map((u) => ({ u, status: accountStatus(u, now) }));
  const paying = rows.filter((r) => r.status === "odeme");
  return { rows, paying, mrr: paying.reduce((a, r) => a + monthlyValue(r.u.plan, r.u.billingPeriod), 0) };
}
