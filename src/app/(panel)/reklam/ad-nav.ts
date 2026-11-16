// Reklam alanının alt menüsü: sol menü (accordion) ve sayfa içi sekmeler aynı listeyi kullanır.
// İkonlar projedeki satır içi SVG yaklaşımıyla çizilmiştir (projede ikon kütüphanesi yok); Lucide ikonlarının biçimini izler.
export type AdTab = "genel" | "kampanya" | "kreatif" | "huni" | "urun" | "akilli" | "rapor";
export const AD_NAV: { key: AdTab; href: string | null; label: string; d: string; soon?: boolean }[] = [
  { key: "genel", href: "/reklam", label: "Genel Bakış", d: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" },
  { key: "kampanya", href: "/reklam/kampanyalar", label: "Kampanya Detayı", d: "M3 11l15-6v14L3 13v-2zM11.6 16.8a3 3 0 11-5.8-1.6" },
  { key: "kreatif", href: "/reklam/kreatifler", label: "Kreatif Analizi", d: "M12 3a9 9 0 000 18c1.1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2a5.4 5.4 0 005.4-5.4C22 6.6 17.5 3 12 3zM7.5 10.5h.01M10.5 7.5h.01M15.5 7.5h.01" },
  { key: "huni", href: "/reklam/huni", label: "Reklam Hunisi", d: "M3 4h18l-7 9v6l-4 2v-8L3 4z" },
  { key: "urun", href: "/reklam/urun-analizi", label: "Ürün Bazlı Analiz", d: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" },
  { key: "akilli", href: "/reklam/akilli-analiz", label: "Akıllı Reklam Analizi", d: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6L5 15z" },
  { key: "rapor", href: "/reklam-raporu", label: "Raporlar", d: "M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7zM14 2v5h6M8 18v-2M12 18v-4M16 18v-6" },
];
export const AD_ROOT_ICON = "M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 11-5.8-1.6";
/** Yol bir reklam alanı sayfası mı (sol menüde Reklam grubunu açık tutmak için). */
export const isAdPath = (p: string) => p === "/reklam" || p.startsWith("/reklam/") || p === "/reklam-raporu" || p.startsWith("/reklam-raporu/");
