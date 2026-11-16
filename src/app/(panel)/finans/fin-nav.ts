// Finans modülünün alt menüsü: sol menü (açılır grup) ve sayfa başlıkları aynı listeyi kullanır.
export const FIN_NAV = [
  { href: "/finans", label: "Genel Bakış" },
  { href: "/finans/urun", label: "Ürün Kârlılığı" },
  { href: "/finans/kanal", label: "Satış Kanalı Kârlılığı" },
  { href: "/finans/gelir-gider", label: "Gelir ve Giderler" },
  { href: "/finans/siparis", label: "Sipariş Finansalları" },
  { href: "/finans/iade", label: "İade ve İptaller" },
  { href: "/finans/stok", label: "Stok ve Sermaye" },
] as const;
export const FIN_ICON = "M4 20V10M10 20V4M16 20v-7M22 20H2";
