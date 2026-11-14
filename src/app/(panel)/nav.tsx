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
      { href: "/otomasyonlar", label: "Otomasyon", d: "M13 3L4 14h7l-1 7 9-11h-7l1-7z" },
      { href: "/indirimler", label: "İndirimler", d: "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z" },
    ],
  },
  {
    title: "Analiz",
    items: [
      { href: "/raporlar", label: "Raporlar", d: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3" },
      { href: "/reklam", label: "Reklam performansı", d: "M3 17l6-6 4 4 8-8M3 21h18" },
      { href: "/reklam-raporu", label: "Reklam raporu", d: "M3 11l14-6v14L3 13v-2zM7 13v5a2 2 0 004 0v-3" },
      { href: "/analiz", label: "Kârlılık", d: "M3 17l6-6 4 4 8-8M15 7h6v6" },
    ],
  },
  {
    title: "Katalog",
    items: [
      { href: "/urunler", label: "Ürünler", d: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10" },
      { href: "/urunler/tanimlamalar", label: "Tanımlamalar", d: "M4 6h7v5H4zM13 6h7v5h-7zM4 13h7v5H4zM16.5 13v5M14 15.5h5" },
      { href: "/stok", label: "Stok", d: "M4 20V10M10 20V4M16 20v-8M22 20H2" },
    ],
  },
  {
    title: "Ayarlar",
    items: [
      { href: "/vitrin", label: "Vitrin modülleri", d: "M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6" },
      { href: "/siteler", label: "Web siteleri", d: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" },
      { href: "/reklam-hesaplari", label: "Reklam hesapları", d: "M3 11l14-6v14L3 13v-2zM7 13v5a2 2 0 004 0v-3" },
      { href: "/entegrasyonlar", label: "Entegrasyonlar", d: "M9 3v5M15 3v5M6 8h12v4a6 6 0 01-12 0V8zM12 18v3" },
      { href: "/lisans", label: "Lisans", d: "M3 7h18v10H3zM3 11h18M7 15h4" },
      { href: "/kayitlar", label: "Kayıtlar", d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" },
    ],
  },
];

/** locked: paketin kapsamadığı sayfalar; menüde kilit simgesiyle görünür, açılınca yükseltme kartı çıkar. */
export function Nav({ locked = [] }: { locked?: string[] }) {
  const path = usePathname();
  const groups = GROUPS;
  // İç içe yollarda (ör. /urunler ve /urunler/tanimlamalar) yalnızca en uzun eşleşen öğe seçili görünür.
  const current = groups.flatMap((g) => g.items.map((n) => n.href)).filter((h) => path === h || path.startsWith(h + "/")).sort((x, y) => y.length - x.length)[0];
  return (
    <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-6 lg:overflow-visible">
      {groups.map((g) => (
        <div key={g.title} className="flex gap-1 lg:block">
          <div className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400 lg:block">{g.title}</div>
          <div className="flex gap-1 lg:block lg:space-y-0.5">
            {g.items.map((n) => {
              const active = n.href === current;
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
                  {locked.includes(n.href) && (
                    <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Paketinize dahil değil"><path d="M6 11h12v10H6zM8 11V7a4 4 0 018 0v4" /></svg>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
