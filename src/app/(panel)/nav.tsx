"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AD_NAV, AD_ROOT_ICON } from "./reklam/ad-nav";
import { FIN_ICON, FIN_NAV } from "./finans/fin-nav";

const I = ({ d, className = "h-[18px] w-[18px]" }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

type Leaf = { href: string; label: string };
type Item = { key: string; label: string; d: string; href?: string; children?: Leaf[] };

// Benzer sayfalar tek başlık altında toplanır; başlığa tıklayınca alt sayfalar açılır.
const MENU: Item[] = [
  { key: "ozet", label: "Özet", href: "/panel", d: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  { key: "siparis", label: "Siparişler", d: "M3 4h2l2.5 11h10L20 7H6.5M9 20h.01M17 20h.01", children: [
    { href: "/siparisler", label: "Siparişler" },
    { href: "/siparisler/sepetler", label: "Terk edilmiş sepetler" },
  ] },
  { key: "urun", label: "Ürünler", d: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10", children: [
    { href: "/urunler", label: "Ürünler" },
    { href: "/urunler/tanimlamalar", label: "Tanımlamalar" },
    { href: "/stok", label: "Stok" },
  ] },
  { key: "pazarlama", label: "Pazarlama", d: "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z", children: [
    { href: "/indirimler", label: "İndirimler" },
    { href: "/otomasyonlar", label: "Otomasyon" },
    { href: "/vitrin", label: "Vitrin modülleri" },
  ] },
  { key: "reklam", label: "Reklam", d: AD_ROOT_ICON, children: AD_NAV.filter((n) => n.href).map((n) => ({ href: n.href!, label: n.label })) },
  { key: "finans", label: "Finans", d: FIN_ICON, children: FIN_NAV.map((n) => ({ href: n.href, label: n.label })) },
  { key: "rapor", label: "Raporlar", d: "M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3", children: [
    { href: "/raporlar", label: "Raporlar" },
    { href: "/analiz", label: "Kârlılık" },
  ] },
  { key: "ayar", label: "Ayarlar", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z", children: [
    { href: "/siteler", label: "Web siteleri" },
    { href: "/reklam-hesaplari", label: "Reklam hesapları" },
    { href: "/entegrasyonlar", label: "Entegrasyonlar" },
    { href: "/lisans", label: "Lisans" },
    { href: "/kayitlar", label: "Kayıtlar" },
  ] },
];

const Lock = () => (
  <svg viewBox="0 0 24 24" className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Paketinize dahil değil"><path d="M6 11h12v10H6zM8 11V7a4 4 0 018 0v4" /></svg>
);

/** locked: paketin kapsamadığı sayfalar; menüde kilit simgesiyle görünür, açılınca yükseltme kartı çıkar. */
export function Nav({ locked = [] }: { locked?: string[] }) {
  const path = usePathname();
  const leaves = MENU.flatMap((m) => m.children ?? [{ href: m.href!, label: m.label }]);
  // İç içe yollarda (ör. /urunler ve /urunler/tanimlamalar) yalnızca en uzun eşleşen sayfa seçili görünür.
  const current = leaves.map((l) => l.href).filter((h) => path === h || path.startsWith(h + "/")).sort((x, y) => y.length - x.length)[0];
  const activeGroup = MENU.find((m) => m.children?.some((c) => c.href === current))?.key ?? null;
  // Kullanıcının açıp kapattığı gruplar; hiç dokunulmamışsa yalnızca bulunulan grup açık.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (k: string) => toggled[k] ?? k === activeGroup;
  const leafCls = (on: boolean) => `flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition-colors ${on ? "bg-[#F1EDFF] text-[#633BFF]" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`;
  const topCls = (on: boolean) => `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? "bg-[#F1EDFF] text-[#633BFF]" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"}`;

  return (
    <>
      {/* Mobil: tüm sayfalar yatay kaydırılabilir şerit. */}
      <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="Menü">
        {leaves.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.href === current ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${l.href === current ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:bg-gray-100"}`}>{l.label}</Link>
        ))}
      </nav>

      {/* Masaüstü: başlıklar ve açılır alt menüler. */}
      <nav className="hidden space-y-0.5 lg:block" aria-label="Menü">
        {MENU.map((m) => {
          if (!m.children) {
            const on = m.href === current;
            return (
              <Link key={m.key} href={m.href!} aria-current={on ? "page" : undefined} className={`${topCls(false)} ${on ? "!bg-[#F1EDFF] !text-[#633BFF]" : ""}`}>
                <I d={m.d} />{m.label}{locked.includes(m.href!) && <Lock />}
              </Link>
            );
          }
          const open = isOpen(m.key), inGroup = m.key === activeGroup;
          return (
            <div key={m.key}>
              <button type="button" onClick={() => setToggled((t) => ({ ...t, [m.key]: !open }))} aria-expanded={open} aria-controls={`menu-${m.key}`} className={topCls(inGroup)}>
                <I d={m.d} />{m.label}
                <svg viewBox="0 0 24 24" className={`ml-auto h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg>
              </button>
              <div id={`menu-${m.key}`} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="space-y-0.5 py-0.5 pl-7">
                    {m.children.map((c) => (
                      <Link key={c.href} href={c.href} tabIndex={open ? undefined : -1} aria-current={c.href === current ? "page" : undefined} className={leafCls(c.href === current)}>
                        {c.label}{locked.includes(c.href) && <Lock />}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}
