import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { PageHeader, fmtDate } from "../ui";
import { markAllRead } from "./actions";

const KIND: Record<string, [string, string]> = { stock: ["Stok", "bg-amber-100 text-amber-800"], automation: ["Otomasyon", "bg-indigo-100 text-indigo-700"] };

export default async function Page() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Bildirimler" desc={`${unread} okunmamış · son 200 bildirim`}>
        {unread > 0 && <form action={markAllRead}><button className="btn-ghost">Tümünü okundu say</button></form>}
      </PageHeader>
      <div className="card divide-y divide-gray-100 p-0">
        {items.map((n) => {
          const [label, cls] = KIND[n.kind] ?? [n.kind, "bg-gray-100 text-gray-600"];
          return (
            <div key={n.id} className={`flex gap-3 px-5 py-3.5 ${n.readAt ? "" : "bg-indigo-50/40"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-indigo-600"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`badge ${cls}`}>{label}</span>
                  <span className="font-medium">{n.link ? <Link href={n.link} className="hover:text-indigo-700 hover:underline">{n.title}</Link> : n.title}</span>
                </div>
                <p className="mt-0.5 text-sm text-gray-600">{n.body}</p>
              </div>
              <span className="shrink-0 text-xs text-gray-400">{fmtDate(n.createdAt)}</span>
            </div>
          );
        })}
        {!items.length && <p className="py-10 text-center text-sm text-gray-500">Henüz bildirim yok.</p>}
      </div>
    </>
  );
}
