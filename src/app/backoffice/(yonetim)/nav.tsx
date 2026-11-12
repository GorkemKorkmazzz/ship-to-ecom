"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const GROUPS = [
  { title: "Genel", items: [{ href: "/backoffice", label: "Özet", d: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" }] },
  {
    title: "Müşteriler",
    items: [
      { href: "/backoffice/hesaplar", label: "Hesaplar ve paketler", d: "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 20v-1a4 4 0 00-3-3.8M15.5 4.2a3.5 3.5 0 010 6.6" },
      { href: "/backoffice/odemeler", label: "Ödemeler", d: "M3 7h18v10H3zM3 11h18M7 15h4" },
      { href: "/backoffice/magazalar", label: "Mağazalar", d: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M10 20v-6h4v6" },
    ],
  },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-6 lg:overflow-visible">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex gap-1 lg:block">
          <div className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 lg:block">{g.title}</div>
          <div className="flex gap-1 lg:block lg:space-y-0.5">
            {g.items.map((n) => {
              const active = n.href === "/backoffice" ? path === n.href : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}>
                  <I d={n.d} />
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
