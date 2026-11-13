"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

const GROUPS = [
  { title: "Genel", items: [{ href: "/panel", label: "Özet", d: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" }] },
  {
    title: "Satış",
    items: [
      { href: "/siparisler", label: "Siparişler", d: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01" },
      { href: "/indirimler", label: "İndirimler", d: "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z" },
    ],
  },
  { title: "Analiz", items: [{ href: "/raporlar", label: "Raporlar", d: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" }] },
  {
    title: "Katalog",
    items: [
      { href: "/urunler", label: "Ürünler", d: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10" },
      { href: "/stok", label: "Stok", d: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
    ],
  },
  {
    title: "Ayarlar",
    items: [
      { href: "/magazalar", label: "Mağazalar", d: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M10 20v-6h4v6" },
      { href: "/lisans", label: "Lisans", d: "M3 7h18v10H3zM3 11h18M7 15h4" },
      { href: "/kayitlar", label: "Kayıtlar", d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
    ],
  },
];

export function Nav() {
  const path = usePathname();
  const groups = GROUPS;
  return (
    <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-6 lg:overflow-visible">
      {groups.map((g) => (
        <div key={g.title} className="flex gap-1 lg:block">
          <div className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 lg:block">{g.title}</div>
          <div className="flex gap-1 lg:block lg:space-y-0.5">
            {g.items.map((n) => {
              const active = path === n.href || path.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
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
