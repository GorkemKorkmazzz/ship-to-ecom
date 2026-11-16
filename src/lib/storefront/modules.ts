// Vitrin modülleri kaydı. Her modül burada tanımlanır; ayar ekranı, doğrulama ve önizleme bu tanımdan üretilir.
// Modülün mağazada çalışan kodu public/sf/loader.js içindeki aynı anahtarlı çizicidir.
// Ayarlar herkese açık uçtan (mağaza temasına) gönderilir: buraya GİZLİ bilgi (anahtar, token) koyan alan eklenmemeli.

export type FieldType = "text" | "textarea" | "url" | "color" | "number" | "boolean" | "select" | "datetime" | "ids" | "items";
export type Field = {
  key: string;
  label: string;
  type: FieldType;
  default: string | number | boolean;
  help?: string;
  group?: string; // ayar ekranında bölüm başlığı
  maxLength?: number;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** ids: seçeneklerin kaynağı (panelde ikas'tan doldurulur). */
  source?: "products" | "categories" | "variants";
  /** items: tekrar eden kayıt (ör. mesajlar); alt alanlar ve en fazla kayıt sayısı. */
  of?: Field[];
  maxItems?: number;
  /** items: panelde hazır şablonlar (alt alan değerleri). */
  templates?: { label: string; values: Record<string, string> }[];
  /** Bu alan yalnızca başka bir alanın değeri şuysa görünür (ör. hedef = ürünler). */
  showIf?: [string, string];
  /** Panelde gösterilmez; sunucu doldurur (ör. ikas kampanya kimliği). */
  hidden?: boolean;
  /** Herkese açık vitrin yapılandırmasına gönderilmez (ör. hazır kod, olasılık); yalnızca sunucuda kullanılır. */
  private?: boolean;
};
/** events: modülün kullandığı olaylar ve panelde görünen adları (verilmezse tümü, varsayılan adlarla). */
export type SfModule = { key: string; name: string; description: string; fields: Field[]; events?: Partial<Record<EventType, string>>; statsNote?: string; help?: string };
export type Scalar = string | number | boolean;
export type Settings = Record<string, Scalar | Record<string, Scalar>[]>;

export const EVENT_TYPES = ["view", "click", "use", "convert"] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const EVENT_LABELS: Record<EventType, string> = { view: "Görüntülenme", click: "Tıklanma", use: "Kullanım", convert: "Dönüşüm" };


const G = { genel: "Genel", zaman: "Zamanlama ve hedefleme", icerik: "İçerik", tasarim: "Tasarım", buton: "Buton", mobil: "Mobil" };
const sel = (...o: [string, string][]) => o.map(([value, label]) => ({ value, label }));
const MSG_ICONS = sel(["none", "Simge yok"], ["truck", "Kargo"], ["return", "İade"], ["card", "Ödeme"], ["installment", "Taksit"], ["discount", "İndirim"], ["info", "Bilgi"], ["gift", "Hediye"], ["clock", "Saat"]);

export const SF_MODULES: SfModule[] = [
  {
    key: "kampanya-bari",
    name: "Kampanya Barı",
    description: "Mağazanın üstünde ya da altında kampanya duyurusu; tarih, sayfa ve cihaz hedeflemeli, butonlu ve kayan yazılı.",
    events: { view: "Görüntülenme", click: "Tıklanma", use: "Kampanya sayfasına geçiş" },
    statsNote: "Geçiş, bağlantı mağazanın kendi sayfasıysa ve ziyaretçi 30 dakika içinde o sayfaya ulaştıysa sayılır; başka sitelere giden bağlantılarda yalnızca tıklanma ölçülür.",
    fields: [
      { group: G.genel, key: "name", label: "Kampanya adı (yalnızca panelde)", type: "text", default: "Kampanya", maxLength: 80 },
      { group: G.zaman, key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "", help: "Boş: hemen başlar." },
      { group: G.zaman, key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "", help: "Boş: süresiz." },
      { group: G.zaman, key: "pageMode", label: "Gösterileceği sayfalar", type: "select", default: "all", options: sel(["all", "Tüm sayfalar"], ["home", "Yalnızca ana sayfa"], ["include", "Yalnızca aşağıdaki yollar"], ["exclude", "Aşağıdaki yollar hariç"]) },
      { group: G.zaman, key: "paths", label: "Yollar", type: "textarea", default: "", maxLength: 1000, help: "Her satıra bir yol, ör. /sepet ya da /kategori/* (sonda * : o yolla başlayan tüm sayfalar)." },
      { group: G.zaman, key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: G.zaman, key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: G.icerik, key: "text", label: "Kampanya metni", type: "text", default: "Sepette %20 indirim! Kod: KAMPANYA20", maxLength: 200 },
      { group: G.icerik, key: "link", label: "Yönlendirme bağlantısı", type: "url", default: "", help: "https:// ile başlayan adres ya da / ile başlayan mağaza yolu." },
      { group: G.icerik, key: "newTab", label: "Bağlantıyı yeni sekmede aç", type: "boolean", default: false },
      { group: G.icerik, key: "closable", label: "Kapatma butonu", type: "boolean", default: true, help: "Kapatılan bar o oturumda tekrar gösterilmez." },
      { group: G.tasarim, key: "position", label: "Konum", type: "select", default: "static", options: sel(["static", "Sayfanın en üstü (temayla birlikte kayar)"], ["fixed-top", "Üstte sabit"], ["fixed-bottom", "Altta sabit"]) },
      { group: G.tasarim, key: "fontFamily", label: "Yazı tipi", type: "select", default: "inherit", options: sel(["inherit", "Temanın yazı tipi"], ["system", "Sistem"], ["serif", "Serif"], ["mono", "Eş aralıklı"]) },
      { group: G.tasarim, key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 10, max: 28 },
      { group: G.tasarim, key: "fontWeight", label: "Kalın yazı", type: "boolean", default: true },
      { group: G.tasarim, key: "color", label: "Yazı rengi", type: "color", default: "#ffffff" },
      { group: G.tasarim, key: "bg", label: "Arka plan rengi", type: "color", default: "#dc2626" },
      { group: G.tasarim, key: "height", label: "Bar yüksekliği (px)", type: "number", default: 44, min: 28, max: 120 },
      { group: G.tasarim, key: "align", label: "Hizalama", type: "select", default: "center", options: sel(["left", "Sola"], ["center", "Ortaya"], ["right", "Sağa"]) },
      { group: G.tasarim, key: "animation", label: "Giriş animasyonu", type: "select", default: "slide", options: sel(["none", "Yok"], ["fade", "Belirme"], ["slide", "Kayarak gelme"]) },
      { group: G.tasarim, key: "marquee", label: "Kayan yazı", type: "boolean", default: false },
      { group: G.tasarim, key: "marqueeSpeed", label: "Kayan yazı turu (saniye)", type: "number", default: 15, min: 4, max: 60 },
      { group: G.buton, key: "buttonText", label: "Buton metni", type: "text", default: "Alışverişe başla", maxLength: 40, help: "Boş: buton yok; bağlantı varsa metnin kendisi tıklanır." },
      { group: G.buton, key: "buttonBg", label: "Buton rengi", type: "color", default: "#ffffff" },
      { group: G.buton, key: "buttonColor", label: "Buton yazı rengi", type: "color", default: "#dc2626" },
      { group: G.mobil, key: "mobileText", label: "Mobil metin", type: "text", default: "", maxLength: 120, help: "Boş: masaüstü metni kullanılır." },
      { group: G.mobil, key: "mobileFontSize", label: "Mobil yazı boyutu (px)", type: "number", default: 13, min: 10, max: 24 },
      { group: G.mobil, key: "mobileHeight", label: "Mobil bar yüksekliği (px)", type: "number", default: 40, min: 28, max: 100 },
      { group: G.mobil, key: "mobileButton", label: "Butonu mobilde göster", type: "boolean", default: true },
    ],
  },
  {
    key: "bilgi-seridi",
    name: "Bilgi Şeridi",
    description: "Ürün sayfasında ürün adı, fiyat ya da Sepete Ekle butonu çevresinde kargo, iade, taksit ve indirim kodu gibi kısa mesajlar.",
    events: { view: "Görüntülenme", use: "Kod kopyalama", click: "Bağlantı tıklama" },
    statsNote: "Görüntülenme, şerit ürün sayfasında gösterildiğinde sayılır. Tıklanma oranı = bağlantı tıklama / görüntülenme.",
    fields: [
      {
        group: "Mesajlar", key: "messages", label: "Mesajlar", type: "items", default: "", maxItems: 12,
        templates: [
          { label: "Kargo", values: { icon: "truck", text: "500 TL üzeri siparişlerde kargo ücretsiz" } },
          { label: "İade", values: { icon: "return", text: "14 gün içinde ücretsiz iade" } },
          { label: "Ödeme", values: { icon: "card", text: "Kredi kartı ve havale ile güvenli ödeme" } },
          { label: "Taksit", values: { icon: "installment", text: "Kredi kartına 6 aya varan taksit imkânı" } },
          { label: "İndirim", values: { icon: "discount", text: "Sepette ek %10 indirim", code: "BILGI10" } },
        ],
        of: [
          { key: "text", label: "Mesaj (en fazla 100 karakter)", type: "text", default: "", maxLength: 100 },
          { key: "icon", label: "Simge", type: "select", default: "info", options: MSG_ICONS },
          { key: "code", label: "İndirim kodu (isteğe bağlı)", type: "text", default: "", maxLength: 40, help: "Doldurulursa yanında tek tıkla kopyalama butonu çıkar. Kodun ikas'ta tanımlı olması gerekir." },
          { key: "link", label: "Bağlantı (isteğe bağlı)", type: "url", default: "" },
          { key: "linkText", label: "Bağlantı metni", type: "text", default: "Detaylar", maxLength: 30 },
          { key: "target", label: "Hangi ürünlerde", type: "select", default: "all", options: sel(["all", "Tüm ürünler"], ["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"]) },
          { key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["target", "products"] },
          { key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["target", "categories"] },
          { key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
          { key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "", help: "Süresi dolan mesaj otomatik yayından kalkar." },
        ],
      },
      { group: "Konum ve düzen", key: "placement", label: "Ürün sayfasında konum", type: "select", default: "below-price", options: sel(["below-name", "Ürün adının altında"], ["below-price", "Fiyatın altında"], ["above-cart", "Sepete Ekle butonunun üstünde"], ["below-cart", "Sepete Ekle butonunun altında"]) },
      { group: "Konum ve düzen", key: "layout", label: "Görünüm", type: "select", default: "stack", options: sel(["stack", "Alt alta"], ["inline", "Yan yana"], ["rotate", "Sıralı (tek tek döner)"]) },
      { group: "Konum ve düzen", key: "rotateSeconds", label: "Sıralı geçiş süresi (saniye)", type: "number", default: 4, min: 2, max: 20, showIf: ["layout", "rotate"] },
      { group: "Konum ve düzen", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Konum ve düzen", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "theme", label: "Hazır tasarım", type: "select", default: "soft", options: sel(["soft", "Yumuşak (kurumsal rengin açık tonu)"], ["solid", "Dolu (kurumsal renk)"], ["outline", "Çerçeveli"], ["minimal", "Sade (arka plansız)"]) },
      { group: "Tasarım", key: "brandColor", label: "Kurumsal renk", type: "color", default: "#2563eb" },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 11, max: 20 },
      { group: "Gelişmiş", key: "nameSelector", label: "Ürün adı seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: ikas temalarındaki h1.product-name kullanılır. Yalnızca temanız farklıysa doldurun." },
      { group: "Gelişmiş", key: "priceSelector", label: "Fiyat seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: .product-detail-page-detail-price-box" },
      { group: "Gelişmiş", key: "cartSelector", label: "Sepete Ekle seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: button.add-to-cart" },
    ],
  },
  {
    key: "cok-al-az-ode",
    name: "Çok Al Az Öde",
    description: "Adet arttıkça artan indirim. Kampanya ikas'ta kademeli indirim olarak oluşturulur; ürün sayfasında kademeler, sepette ulaşılan kademe gösterilir.",
    help: "İndirimi ikas uygular: Yayınla dediğinizde aktif kampanyalar ikas'ta kademeli indirim (tieredDiscount) olarak oluşturulur ya da güncellenir; modül pasif yapılınca ya da kampanya silinince ikas'tan da silinir. Taslak ve önizleme ikas'ı değiştirmez.",
    events: { view: "Görüntülenme" },
    statsNote: "Görüntülenme, kademeler ürün sayfasında gösterildiğinde sayılır. Sipariş ve tutar, senkronlanan ikas siparişlerinde kampanya adının indirim satırı olarak geçmesinden hesaplanır.",
    fields: [
      {
        group: "Kampanyalar", key: "campaigns", label: "Kampanyalar", type: "items", default: "", maxItems: 10,
        templates: [{ label: "2 al %10, 3 al %15", values: { name: "Çok Al Az Öde", discountType: "RATIO", t1q: "2", t1a: "10", t2q: "3", t2a: "15" } }],
        of: [
          { key: "name", label: "Kampanya adı (ikas'ta ve siparişte görünür)", type: "text", default: "Çok Al Az Öde", maxLength: 80 },
          { key: "active", label: "Aktif", type: "boolean", default: true },
          { key: "scope", label: "Geçerli ürünler", type: "select", default: "all", options: sel(["all", "Tüm ürünler"], ["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"]) },
          { key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["scope", "products"] },
          { key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["scope", "categories"] },
          { key: "discountType", label: "İndirim türü", type: "select", default: "RATIO", options: sel(["RATIO", "Yüzde (%)"], ["FIXED_AMOUNT", "Sabit tutar (TL)"]) },
          { key: "t1q", label: "1. kademe: en az adet", type: "number", default: "", min: 2, max: 999 },
          { key: "t1a", label: "1. kademe: indirim", type: "number", default: "", min: 0, max: 100000 },
          { key: "t2q", label: "2. kademe: en az adet", type: "number", default: "", min: 2, max: 999 },
          { key: "t2a", label: "2. kademe: indirim", type: "number", default: "", min: 0, max: 100000 },
          { key: "t3q", label: "3. kademe: en az adet", type: "number", default: "", min: 2, max: 999 },
          { key: "t3a", label: "3. kademe: indirim", type: "number", default: "", min: 0, max: 100000 },
          { key: "t4q", label: "4. kademe: en az adet", type: "number", default: "", min: 2, max: 999 },
          { key: "t4a", label: "4. kademe: indirim", type: "number", default: "", min: 0, max: 100000 },
          { key: "applicablePrice", label: "İndirim hangi fiyattan", type: "select", default: "SELL_PRICE", options: sel(["SELL_PRICE", "Satış fiyatı"], ["DISCOUNT_PRICE", "İndirimli fiyat"]) },
          { key: "combine", label: "Diğer kampanyalarla birleşebilir", type: "boolean", default: false },
          { key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
          { key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "" },
          { key: "ikasId", label: "ikas kampanya kimliği", type: "text", default: "", maxLength: 64, hidden: true },
        ],
      },
      { group: "Ürün sayfası", key: "placement", label: "Konum", type: "select", default: "below-price", options: sel(["below-name", "Ürün adının altında"], ["below-price", "Fiyatın altında"], ["above-cart", "Sepete Ekle butonunun üstünde"], ["below-cart", "Sepete Ekle butonunun altında"]) },
      { group: "Ürün sayfası", key: "title", label: "Başlık", type: "text", default: "Çok al, az öde", maxLength: 60 },
      { group: "Ürün sayfası", key: "tierText", label: "Kademe metni", type: "text", default: "{adet} al, {indirim} indirim", maxLength: 60, help: "{adet} ve {indirim} yer tutucuları kullanılabilir." },
      { group: "Sepet", key: "showCart", label: "Sepette kademe bilgisini göster", type: "boolean", default: true, help: "Sepete ürün eklendiğinde ve sepet görüntülendiğinde ekranın altında küçük bir bilgi kutusu açılır." },
      { group: "Sepet", key: "cartReached", label: "Ulaşılan kademe metni", type: "text", default: "Sepetinizde {adet} ürün var: {indirim} indirim kazandınız", maxLength: 100 },
      { group: "Sepet", key: "cartNext", label: "Sonraki kademe metni", type: "text", default: "{kalan} ürün daha ekleyin, {indirim} indirim kazanın", maxLength: 100, help: "{adet}, {kalan} ve {indirim} kullanılabilir." },
      { group: "Tasarım", key: "accent", label: "Vurgu rengi", type: "color", default: "#16a34a" },
      { group: "Tasarım", key: "bg", label: "Arka plan", type: "color", default: "#f0fdf4" },
      { group: "Tasarım", key: "color", label: "Yazı rengi", type: "color", default: "#14532d" },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 11, max: 20 },
      { group: "Tasarım", key: "style", label: "Görünüm", type: "select", default: "cards", options: sel(["cards", "Kademe kartları"], ["list", "Liste"]) },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Tasarım", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
    ],
  },
  {
    key: "tukenmek-uzere",
    name: "Tükenmek Üzere",
    description: "Seçili varyantın ikas stoğu eşiğin altına indiğinde ürün sayfasında uyarı gösterir; varyant değişince ve stok güncellenince mesaj kendiliğinden yenilenir.",
    help: "Stok ikas'tan gelir: sayfa açılırken ikas temasının ürün verisindeki varyant stoğu kullanılır; sayfa açıkken panel ikas'tan daha yeni stok senkronlarsa o değer uygulanır. Stok 0 olduğunda ya da eşiğin üstündeyken hiçbir şey gösterilmez.",
    events: { view: "Görüntülenme", click: "Sepete Ekle tıklaması (uyarı görünürken)" },
    statsNote: "Görüntülenme, uyarı bir ürün sayfasında gösterildiğinde sayılır. Tıklanma, uyarı görünürken Sepete Ekle butonuna basılmasıdır.",
    fields: [
      { group: "Stok ve hedefleme", key: "threshold", label: "Uyarı eşiği (stok bu sayı ya da altındaysa)", type: "number", default: 5, min: 1, max: 1000 },
      { group: "Stok ve hedefleme", key: "scope", label: "Hangi ürünlerde", type: "select", default: "all", options: sel(["all", "Tüm ürünler"], ["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"]) },
      { group: "Stok ve hedefleme", key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["scope", "products"] },
      { group: "Stok ve hedefleme", key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["scope", "categories"] },
      { group: "Stok ve hedefleme", key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
      { group: "Stok ve hedefleme", key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "" },
      { group: "Mesaj", key: "showCount", label: "Gerçek stok miktarını göster", type: "boolean", default: true },
      { group: "Mesaj", key: "textCount", label: "Stok gösterilirken mesaj", type: "text", default: "Son {stok} ürün!", maxLength: 80, help: "{stok} yerine seçili varyantın gerçek stoğu yazılır." },
      { group: "Mesaj", key: "text", label: "Stok gizlenirken mesaj", type: "text", default: "Stoklar tükenmek üzere!", maxLength: 80 },
      { group: "Mesaj", key: "indicator", label: "Gösterge", type: "select", default: "bar", options: sel(["none", "Yok"], ["bar", "İlerleme çubuğu"], ["dots", "Stok noktaları"]) },
      { group: "Mesaj", key: "barMax", label: "Çubuğun dolu kabul edildiği stok", type: "number", default: 20, min: 2, max: 1000, help: "Çubuk doluluğu = stok / bu sayı. Noktalar en fazla eşik kadar gösterilir." },
      { group: "Konum", key: "placement", label: "Ürün sayfasında konum", type: "select", default: "above-cart", options: sel(["below-name", "Ürün adının altında"], ["below-price", "Fiyatın altında"], ["above-cart", "Sepete Ekle butonunun üstünde"], ["below-cart", "Sepete Ekle butonunun altında"]) },
      { group: "Konum", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Konum", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "theme", label: "Hazır tasarım", type: "select", default: "soft", options: sel(["soft", "Yumuşak"], ["solid", "Dolu"], ["outline", "Çerçeveli"], ["minimal", "Sade"]) },
      { group: "Tasarım", key: "accent", label: "Vurgu rengi (ikon, çubuk, çerçeve)", type: "color", default: "#dc2626" },
      { group: "Tasarım", key: "bg", label: "Arka plan rengi", type: "color", default: "#fef2f2" },
      { group: "Tasarım", key: "color", label: "Yazı rengi", type: "color", default: "#7f1d1d" },
      { group: "Tasarım", key: "icon", label: "İkon", type: "select", default: "fire", options: sel(["none", "İkon yok"], ["fire", "Ateş"], ["clock", "Saat"], ["alert", "Uyarı"], ["box", "Kutu"], ["bolt", "Şimşek"]) },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 11, max: 22 },
      { group: "Tasarım", key: "mobileFontSize", label: "Mobil yazı boyutu (px)", type: "number", default: 13, min: 10, max: 20 },
      { group: "Tasarım", key: "align", label: "Hizalama", type: "select", default: "left", options: sel(["left", "Sola"], ["center", "Ortaya"], ["right", "Sağa"]) },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Gelişmiş", key: "nameSelector", label: "Ürün adı seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: h1.product-name" },
      { group: "Gelişmiş", key: "priceSelector", label: "Fiyat seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: .product-detail-page-detail-price-box" },
      { group: "Gelişmiş", key: "cartSelector", label: "Sepete Ekle seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: button.add-to-cart" },
    ],
  },
  {
    key: "hediye-carki",
    name: "Hediye Çarkı",
    description: "Ziyaretçi çarkı çevirir; ödül sunucuda belirlenen olasılıklarla seçilir, indirimli ödüllerde kişiye özel ikas kuponu üretilir.",
    help: "İndirim ödülleri için Yayınla dediğinizde ikas'ta kuponlu kampanya oluşturulur; her kazanana bu kampanyaya bağlı benzersiz bir kupon eklenir. Modül pasif yapılınca çark durur ama ikas kampanyaları silinmez (verilmiş kuponlar geçerli kalsın diye). Ödülün e-posta/SMS ile gönderimi yoktur: kazanılan kod ekranda gösterilir.",
    events: { view: "Görüntülenme" },
    statsNote: "Çevirme, kazanım ve kupon kullanımı sunucu kayıtlarından ve ikas kupon verisinden gelir; görüntülenme vitrinden gelir.",
    fields: [
      {
        group: "Ödül dilimleri", key: "prizes", label: "Dilimler", type: "items", default: "", maxItems: 12,
        templates: [
          { label: "%10 indirim", values: { label: "%10 İndirim", type: "RATIO", amount: "10", chance: "30", color: "#f97316", icon: "discount" } },
          { label: "50 TL indirim", values: { label: "50 TL İndirim", type: "FIXED_AMOUNT", amount: "50", chance: "15", color: "#0ea5e9", icon: "gift" } },
          { label: "Ücretsiz kargo", values: { label: "Ücretsiz Kargo", type: "FREE_SHIPPING", chance: "25", color: "#22c55e", icon: "truck" } },
          { label: "Boş dilim", values: { label: "Tekrar dene", type: "NONE", chance: "30", color: "#94a3b8", icon: "none" } },
        ],
        of: [
          { key: "label", label: "Dilim metni", type: "text", default: "Ödül", maxLength: 24 },
          { key: "type", label: "Ödül türü", type: "select", default: "RATIO", options: sel(["RATIO", "Yüzde indirim"], ["FIXED_AMOUNT", "Sabit tutar indirim"], ["FREE_SHIPPING", "Ücretsiz kargo"], ["CODE", "Hazır indirim kodu"], ["NONE", "Ödülsüz (boş dilim)"]) },
          { key: "amount", label: "İndirim (yüzde ya da TL)", type: "number", default: "", min: 0, max: 100000 },
          { key: "code", label: "Hazır indirim kodu", type: "text", default: "", maxLength: 40, showIf: ["type", "CODE"], private: true, help: "ikas'ta önceden tanımlı bir kod; herkese aynı kod gösterilir." },
          { key: "chance", label: "Kazanma olasılığı (%)", type: "number", default: "", min: 0, max: 100, private: true, help: "Tüm dilimlerin toplamı tam 100 olmalı." },
          { key: "color", label: "Dilim rengi", type: "color", default: "#6366f1" },
          { key: "textColor", label: "Dilim yazı rengi", type: "color", default: "#ffffff" },
          { key: "icon", label: "İkon", type: "select", default: "none", options: sel(["none", "Yok"], ["gift", "Hediye"], ["discount", "İndirim"], ["truck", "Kargo"], ["fire", "Ateş"], ["bolt", "Şimşek"]) },
          { key: "key", label: "Dilim anahtarı", type: "text", default: "", maxLength: 24, hidden: true },
          { key: "ikasId", label: "ikas kampanya kimliği", type: "text", default: "", maxLength: 64, hidden: true, private: true },
        ],
      },
      { group: "Katılım", key: "contactMode", label: "Katılım için istenen bilgi", type: "select", default: "email", options: sel(["none", "Bilgi istenmez"], ["email", "E-posta"], ["phone", "Telefon"], ["either", "E-posta ya da telefon"]) },
      { group: "Katılım", key: "consentText", label: "Açık rıza metni", type: "text", default: "Kişisel verilerimin kampanya iletişimi için işlenmesini kabul ediyorum.", maxLength: 200, help: "İletişim bilgisi istenirse bu onay kutusu zorunludur." },
      { group: "Katılım", key: "privacyUrl", label: "Aydınlatma metni bağlantısı", type: "url", default: "" },
      { group: "Katılım", key: "storeContact", label: "İletişim bilgisini şifreli sakla", type: "boolean", default: false, help: "Kapalıyken yalnızca tekrar kontrolü için geri çevrilemez özet tutulur." },
      { group: "Katılım", key: "repeatDays", label: "Tekrar katılım süresi (gün)", type: "number", default: 30, min: 1, max: 365 },
      { group: "Katılım", key: "byContact", label: "Aynı e-posta/telefonla tekrar katılımı engelle", type: "boolean", default: true },
      { group: "Katılım", key: "byCookie", label: "Aynı tarayıcıdan tekrar katılımı engelle", type: "boolean", default: true },
      { group: "Katılım", key: "byIp", label: "Aynı IP adresinden tekrar katılımı engelle", type: "boolean", default: false, help: "Aynı ağı paylaşan farklı kişileri de engelleyebilir." },
      { group: "Kupon", key: "codePrefix", label: "Kupon ön eki", type: "text", default: "CARK", maxLength: 8 },
      { group: "Kupon", key: "couponUsageLimit", label: "Kupon kullanım limiti", type: "number", default: 1, min: 1, max: 100 },
      { group: "Kupon", key: "couponValidityDays", label: "Kupon geçerlilik süresi", type: "number", default: "", min: 1, max: 365, help: "ikas'ın couponValidityPeriod alanına yazılır. Bu alanın birimi ikas belgelerinde yok; gerçek ortam testinde doğrulanacak. Boş: süresiz." },
      { group: "Kupon", key: "combine", label: "Diğer kampanyalarla birleşebilir", type: "boolean", default: false },
      { group: "Gösterim", key: "trigger", label: "Açılma zamanı", type: "select", default: "delay", options: sel(["delay", "Belirli süre sonra"], ["exit", "Sayfadan çıkış niyetinde"], ["both", "Süre ya da çıkış niyeti (hangisi önce)"], ["launcher", "Yalnızca köşedeki butonla"]) },
      { group: "Gösterim", key: "delaySeconds", label: "Bekleme süresi (saniye)", type: "number", default: 8, min: 0, max: 600 },
      { group: "Gösterim", key: "launcher", label: "Köşede çark butonu göster", type: "boolean", default: true },
      { group: "Gösterim", key: "reshowDays", label: "Kapatılınca tekrar gösterme süresi (gün)", type: "number", default: 3, min: 0, max: 365 },
      { group: "Gösterim", key: "pageMode", label: "Sayfalar", type: "select", default: "all", options: sel(["all", "Tüm sayfalar"], ["home", "Yalnızca ana sayfa"], ["include", "Yalnızca aşağıdaki yollar"], ["exclude", "Aşağıdaki yollar hariç"]) },
      { group: "Gösterim", key: "paths", label: "Yollar", type: "textarea", default: "", maxLength: 1000, help: "Her satıra bir yol; sonda * ile o yolla başlayanlar." },
      { group: "Gösterim", key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
      { group: "Gösterim", key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "" },
      { group: "Gösterim", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Gösterim", key: "position", label: "Masaüstünde konum", type: "select", default: "center", options: sel(["center", "Ortada"], ["left", "Sol alt"], ["right", "Sağ alt"]) },
      { group: "Gösterim", key: "size", label: "Masaüstünde boyut", type: "select", default: "md", options: sel(["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"]) },
      { group: "Gösterim", key: "mobileMode", label: "Mobilde görünüm", type: "select", default: "sheet", options: sel(["sheet", "Alttan açılan tam genişlik"], ["center", "Ortada"]) },
      { group: "Tasarım", key: "preset", label: "Hazır tasarım", type: "select", default: "klasik", options: sel(["klasik", "Klasik (dilim renkleri)"], ["pastel", "Pastel"], ["koyu", "Koyu"]), help: "Pastel ve Koyu, dilim renklerini kendi paletiyle değiştirir." },
      { group: "Tasarım", key: "title", label: "Açılış başlığı", type: "text", default: "Çarkı çevir, hediyeni kazan!", maxLength: 60 },
      { group: "Tasarım", key: "subtitle", label: "Açılış açıklaması", type: "text", default: "Her ziyaretçiye bir şans.", maxLength: 120 },
      { group: "Tasarım", key: "buttonText", label: "Buton metni", type: "text", default: "Çarkı çevir", maxLength: 30 },
      { group: "Tasarım", key: "buttonBg", label: "Buton rengi", type: "color", default: "#111827" },
      { group: "Tasarım", key: "buttonColor", label: "Buton yazı rengi", type: "color", default: "#ffffff" },
      { group: "Tasarım", key: "bg", label: "Pencere arka planı", type: "color", default: "#ffffff" },
      { group: "Tasarım", key: "color", label: "Yazı rengi", type: "color", default: "#111827" },
      { group: "Tasarım", key: "centerColor", label: "Çark merkezi", type: "color", default: "#111827" },
      { group: "Tasarım", key: "pointerColor", label: "Ok rengi", type: "color", default: "#dc2626" },
      { group: "Tasarım", key: "borderColor", label: "Çark çerçevesi", type: "color", default: "#111827" },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Sonuç ekranı", key: "winTitle", label: "Kazanınca başlık", type: "text", default: "Tebrikler! {odul} kazandınız", maxLength: 80 },
      { group: "Sonuç ekranı", key: "codeLabel", label: "Kod açıklaması", type: "text", default: "Sepette bu kodu kullanın:", maxLength: 80 },
      { group: "Sonuç ekranı", key: "noWinText", label: "Boş dilimde metin", type: "text", default: "Bu sefer olmadı, bir dahaki sefere!", maxLength: 80 },
      { group: "Sonuç ekranı", key: "repeatText", label: "Daha önce katılanlara metin", type: "text", default: "Bu kampanyaya daha önce katıldınız.", maxLength: 80 },
    ],
  },
  {
    key: "flash-urunler",
    name: "Flash Ürünler",
    description: "Süreli indirimli ürünleri seçilen sayfada geri sayımla listeler; indirim ikas'ta kampanya olarak uygulanır.",
    help: "Yayınla dediğinizde aktif kampanyalar ikas'ta indirim kampanyası olarak oluşturulur (ürün fiyatına yansıtma açık). Modül ya da kampanya pasif yapılınca ikas'tan silinir. Listede gösterilen fiyat, stok ve görsel ikas'tan senkronlanan verilerdir; indirimli fiyat kampanya oranından hesaplanır.",
    events: { view: "Görüntülenme", click: "Ürün tıklanması" },
    statsNote: "Görüntülenme, liste sayfada gösterildiğinde sayılır. Kampanya kaynaklı satış, ikas siparişlerinin indirim satırında kampanya adının geçmesinden hesaplanır.",
    fields: [
      {
        group: "Kampanyalar", key: "campaigns", label: "Kampanyalar", type: "items", default: "", maxItems: 10,
        templates: [{ label: "24 saatlik %20", values: { name: "Flash %20", title: "Flash İndirim", description: "Kaçırmayın, süre dolmak üzere!", discountType: "RATIO", amount: "20", scope: "products" } }],
        of: [
          { key: "name", label: "Kampanya adı (ikas'ta ve siparişte görünür)", type: "text", default: "Flash İndirim", maxLength: 80 },
          { key: "active", label: "Aktif", type: "boolean", default: true },
          { key: "title", label: "Vitrin başlığı", type: "text", default: "Flash İndirim", maxLength: 60 },
          { key: "description", label: "Açıklama", type: "text", default: "", maxLength: 140 },
          { key: "scope", label: "Ürünler", type: "select", default: "products", options: sel(["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"]) },
          { key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["scope", "products"] },
          { key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["scope", "categories"] },
          { key: "discountType", label: "İndirim türü", type: "select", default: "RATIO", options: sel(["RATIO", "Yüzde (%)"], ["FIXED_AMOUNT", "Sabit tutar (TL)"]) },
          { key: "amount", label: "İndirim değeri", type: "number", default: "", min: 0, max: 100000 },
          { key: "applicablePrice", label: "İndirim hangi fiyattan", type: "select", default: "SELL_PRICE", options: sel(["SELL_PRICE", "Satış fiyatı"], ["DISCOUNT_PRICE", "İndirimli fiyat"]) },
          { key: "combine", label: "Diğer kampanyalarla birleşebilir", type: "boolean", default: false },
          { key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
          { key: "endAt", label: "Bitiş (Türkiye saati, zorunlu)", type: "datetime", default: "" },
          { key: "ikasId", label: "ikas kampanya kimliği", type: "text", default: "", maxLength: 64, hidden: true, private: true },
        ],
      },
      { group: "Gösterim", key: "pageMode", label: "Sayfalar", type: "select", default: "home", options: sel(["home", "Yalnızca ana sayfa"], ["all", "Tüm sayfalar"], ["include", "Yalnızca aşağıdaki yollar"], ["exclude", "Aşağıdaki yollar hariç"]) },
      { group: "Gösterim", key: "paths", label: "Yollar", type: "textarea", default: "", maxLength: 1000 },
      { group: "Gösterim", key: "position", label: "Sayfadaki yer", type: "select", default: "afterHeader", options: sel(["afterHeader", "Üst menünün hemen altında"], ["beforeFooter", "Alt bilginin (footer) hemen üstünde"], ["selector", "Belirli bir öğenin altında (CSS seçici)"]) },
      { group: "Gösterim", key: "anchorSelector", label: "CSS seçici", type: "text", default: "", maxLength: 120, showIf: ["position", "selector"] },
      { group: "Gösterim", key: "hideOutOfStock", label: "Stokta olmayan ürünleri gizle", type: "boolean", default: true },
      { group: "Gösterim", key: "sort", label: "Sıralama", type: "select", default: "discount", options: sel(["discount", "En yüksek indirim"], ["priceAsc", "Fiyat artan"], ["priceDesc", "Fiyat azalan"], ["name", "Ada göre"]) },
      { group: "Gösterim", key: "limit", label: "Gösterilecek ürün sayısı", type: "number", default: 8, min: 1, max: 24 },
      { group: "Gösterim", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "preset", label: "Hazır tasarım", type: "select", default: "acik", options: sel(["acik", "Açık"], ["koyu", "Koyu"], ["canli", "Canlı"]) },
      { group: "Tasarım", key: "accent", label: "Vurgu rengi (etiket, geri sayım)", type: "color", default: "#dc2626" },
      { group: "Tasarım", key: "bg", label: "Bölüm arka planı", type: "color", default: "#fff7ed" },
      { group: "Tasarım", key: "cardBg", label: "Kart arka planı", type: "color", default: "#ffffff" },
      { group: "Tasarım", key: "color", label: "Yazı rengi", type: "color", default: "#111827" },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 11, max: 20 },
      { group: "Tasarım", key: "columns", label: "Masaüstü sütun sayısı", type: "number", default: 4, min: 2, max: 6 },
      { group: "Tasarım", key: "mobileColumns", label: "Mobil sütun sayısı", type: "number", default: 2, min: 1, max: 3 },
      { group: "Tasarım", key: "gap", label: "Kart aralığı (px)", type: "number", default: 12, min: 4, max: 32 },
      { group: "Tasarım", key: "radius", label: "Köşe yuvarlaklığı (px)", type: "number", default: 12, min: 0, max: 24 },
      { group: "Tasarım", key: "showCountdown", label: "Geri sayımı göster", type: "boolean", default: true },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
    ],
  },
  {
    key: "fiyat-alti-indirim",
    name: "Fiyat Altı İndirimi",
    description: "Ürün detay sayfasında fiyatın altında ürüne ya da varyanta özel indirimi, eski ve yeni fiyatı ve kazancı gösterir; indirim ikas'ta kampanya olarak uygulanır.",
    help: "Yayınla dediğinizde aktif kampanyalar ikas'ta indirim kampanyası olarak oluşturulur (sepette uygulanır; ürün fiyatına yansıtma kapalı). Modül ya da kampanya pasif yapılınca ikas'tan silinir. Bir üründe birden fazla kampanya eşleşirse listede üstte olan gösterilir.",
    events: { view: "Görüntülenme", click: "Tıklanma", use: "Kampanya etkileşimi (bilgi görünürken Sepete Ekle)" },
    statsNote: "Tıklanma, bilgi kutusuna tıklanmasıdır. Kampanya kaynaklı satış, ikas siparişlerinin indirim satırında kampanya adının geçmesinden hesaplanır.",
    fields: [
      {
        group: "Kampanyalar", key: "campaigns", label: "Kampanyalar", type: "items", default: "", maxItems: 10,
        templates: [{ label: "Sepette %10", values: { name: "Sepette %10", message: "Sepette {oran} indirim", discountType: "RATIO", amount: "10", scope: "all" } }],
        of: [
          { key: "name", label: "Kampanya adı (ikas'ta ve siparişte görünür)", type: "text", default: "Ürüne özel indirim", maxLength: 80 },
          { key: "active", label: "Aktif", type: "boolean", default: true },
          { key: "message", label: "Mesaj", type: "text", default: "Sepette {oran} indirim", maxLength: 80, help: "{oran}, {tutar}, {yeni} ve {kazanc} kullanılabilir." },
          { key: "description", label: "Kampanya açıklaması", type: "text", default: "", maxLength: 160 },
          { key: "scope", label: "Hangi ürünlerde", type: "select", default: "all", options: sel(["all", "Tüm ürünler"], ["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"], ["variants", "Seçili varyantlar"]) },
          { key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["scope", "products"] },
          { key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["scope", "categories"] },
          { key: "variantIds", label: "Varyantlar", type: "ids", default: "", source: "variants", showIf: ["scope", "variants"] },
          { key: "catProducts", label: "Kategorideki ürünler", type: "text", default: "", maxLength: 40000, hidden: true },
          { key: "discountType", label: "İndirim türü", type: "select", default: "RATIO", options: sel(["RATIO", "Yüzde (%)"], ["FIXED_AMOUNT", "Sabit tutar (TL)"]) },
          { key: "amount", label: "İndirim değeri", type: "number", default: "", min: 0, max: 100000 },
          { key: "applicablePrice", label: "İndirim hangi fiyattan", type: "select", default: "SELL_PRICE", options: sel(["SELL_PRICE", "Satış fiyatı"], ["DISCOUNT_PRICE", "İndirimli fiyat"]) },
          { key: "combine", label: "Diğer kampanyalarla birleşebilir", type: "boolean", default: false },
          { key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
          { key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "" },
          { key: "ikasId", label: "ikas kampanya kimliği", type: "text", default: "", maxLength: 64, hidden: true, private: true },
        ],
      },
      { group: "Gösterim", key: "placement", label: "Konum", type: "select", default: "below-price", options: sel(["below-price", "Fiyatın altında"], ["below-name", "Ürün adının altında"], ["above-cart", "Sepete Ekle butonunun üstünde"], ["below-cart", "Sepete Ekle butonunun altında"]) },
      { group: "Gösterim", key: "showPrices", label: "Eski ve yeni fiyatı göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showSaving", label: "Kazanılan tutarı göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showCountdown", label: "Bitiş tarihi varsa geri sayım göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "preset", label: "Hazır tasarım", type: "select", default: "soft", options: sel(["soft", "Yumuşak"], ["solid", "Dolu"], ["outline", "Çerçeveli"], ["minimal", "Sade"]) },
      { group: "Tasarım", key: "accent", label: "Vurgu rengi", type: "color", default: "#16a34a" },
      { group: "Tasarım", key: "bg", label: "Arka plan", type: "color", default: "#f0fdf4" },
      { group: "Tasarım", key: "color", label: "Yazı rengi", type: "color", default: "#14532d" },
      { group: "Tasarım", key: "icon", label: "İkon", type: "select", default: "discount", options: sel(["none", "Yok"], ["discount", "İndirim"], ["gift", "Hediye"], ["fire", "Ateş"], ["bolt", "Şimşek"], ["clock", "Saat"]) },
      { group: "Tasarım", key: "badgeText", label: "İndirim etiketi metni", type: "text", default: "-{oran}", maxLength: 20, help: "Boş: etiket gösterilmez." },
      { group: "Tasarım", key: "badgeShape", label: "Etiket şekli", type: "select", default: "pill", options: sel(["pill", "Hap"], ["square", "Köşeli"], ["rounded", "Yuvarlatılmış"]) },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 14, min: 11, max: 20 },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Gelişmiş", key: "nameSelector", label: "Ürün adı seçicisi (CSS)", type: "text", default: "", maxLength: 120 },
      { group: "Gelişmiş", key: "priceSelector", label: "Fiyat seçicisi (CSS)", type: "text", default: "", maxLength: 120 },
      { group: "Gelişmiş", key: "cartSelector", label: "Sepete Ekle seçicisi (CSS)", type: "text", default: "", maxLength: 120 },
    ],
  },
  {
    key: "urun-etiketleri",
    name: "Ürün Etiketleri",
    description: "Ürün görsellerinin köşesinde Yeni, Çok Satan, İndirimde, Tükendi gibi etiketler; elle ya da gerçek fiyat, stok, tarih ve satışa göre otomatik.",
    help: "Otomatik kurallar sunucuda hesaplanır: indirim ve stok ikas'tan senkronlanan fiyat/stoktan, yeni ürün ikas ürün oluşturma tarihinden, çok satan ise senkronlanan siparişlerden. Koşul değişince etiket kendiliğinden eklenir ya da kalkar (en geç 5 dakika). Listede üstteki etiketin önceliği yüksektir.",
    events: { view: "Etiket görüntülenme", click: "Etiketli ürün tıklaması" },
    statsNote: "Görüntülenme, sayfada en az bir etiket gösterildiğinde sayılır (etiket bazında ayrı sayılmaz).",
    fields: [
      {
        group: "Etiketler", key: "labels", label: "Etiketler", type: "items", default: "", maxItems: 20,
        templates: [
          { label: "Yeni", values: { text: "Yeni", rule: "new", ruleValue: "14", bg: "#2563eb", icon: "bolt" } },
          { label: "Çok Satan", values: { text: "Çok Satan", rule: "bestseller", ruleValue: "10", bg: "#f59e0b", icon: "fire" } },
          { label: "İndirimde", values: { text: "%{oran} İndirim", rule: "discount", ruleValue: "1", bg: "#dc2626", icon: "discount" } },
          { label: "Tükendi", values: { text: "Tükendi", rule: "outOfStock", bg: "#4b5563", icon: "none" } },
          { label: "Sınırlı Stok", values: { text: "Sınırlı Stok", rule: "lowStock", ruleValue: "5", bg: "#ea580c", icon: "clock" } },
        ],
        of: [
          { key: "text", label: "Etiket metni", type: "text", default: "Özel", maxLength: 24, help: "İndirim kuralında {oran} kullanılabilir." },
          { key: "active", label: "Aktif", type: "boolean", default: true },
          { key: "rule", label: "Gösterim kuralı", type: "select", default: "manual", options: sel(["manual", "Elle (seçili ürünler/kategoriler)"], ["discount", "Otomatik: indirimli ürünler"], ["new", "Otomatik: yeni eklenen ürünler"], ["lowStock", "Otomatik: sınırlı stok"], ["outOfStock", "Otomatik: tükenen ürünler"], ["bestseller", "Otomatik: çok satanlar"]) },
          { key: "ruleValue", label: "Kural değeri", type: "number", default: "", min: 0, max: 1000, help: "İndirim: en az % · Yeni: son kaç gün · Sınırlı stok: en fazla adet · Çok satan: ilk kaç ürün." },
          { key: "bestsellerDays", label: "Çok satan: son kaç günün satışı", type: "number", default: 30, min: 1, max: 365, showIf: ["rule", "bestseller"] },
          { key: "scope", label: "Hangi ürünlerde", type: "select", default: "all", options: sel(["all", "Tüm ürünler"], ["products", "Seçili ürünler"], ["categories", "Seçili kategoriler"]) },
          { key: "productIds", label: "Ürünler", type: "ids", default: "", source: "products", showIf: ["scope", "products"] },
          { key: "categoryIds", label: "Kategoriler", type: "ids", default: "", source: "categories", showIf: ["scope", "categories"] },
          { key: "position", label: "Konum", type: "select", default: "top-left", options: sel(["top-left", "Sol üst"], ["top-right", "Sağ üst"], ["bottom-left", "Sol alt"], ["bottom-right", "Sağ alt"]) },
          { key: "shape", label: "Şekil", type: "select", default: "pill", options: sel(["pill", "Hap"], ["rounded", "Yuvarlatılmış"], ["square", "Köşeli"], ["circle", "Daire"]) },
          { key: "bg", label: "Arka plan", type: "color", default: "#111827" },
          { key: "color", label: "Yazı rengi", type: "color", default: "#ffffff" },
          { key: "icon", label: "İkon", type: "select", default: "none", options: sel(["none", "Yok"], ["bolt", "Şimşek"], ["fire", "Ateş"], ["discount", "İndirim"], ["clock", "Saat"], ["gift", "Hediye"], ["box", "Kutu"]) },
          { key: "imageUrl", label: "Özel etiket görseli (https adresi)", type: "url", default: "", help: "Doldurulursa metin yerine bu görsel gösterilir. Dosya yükleme yok; görselin herkese açık https adresi gerekir." },
          { key: "startAt", label: "Başlangıç (Türkiye saati)", type: "datetime", default: "" },
          { key: "endAt", label: "Bitiş (Türkiye saati)", type: "datetime", default: "" },
        ],
      },
      { group: "Gösterim", key: "maxPerProduct", label: "Bir üründe en fazla etiket", type: "number", default: 2, min: 1, max: 5 },
      { group: "Gösterim", key: "showOn", label: "Nerede gösterilsin", type: "select", default: "both", options: sel(["both", "Ürün listeleri ve ürün sayfası"], ["listing", "Yalnızca ürün listeleri"], ["detail", "Yalnızca ürün sayfası"]) },
      { group: "Gösterim", key: "showDesktop", label: "Masaüstünde göster", type: "boolean", default: true },
      { group: "Gösterim", key: "showMobile", label: "Mobilde göster", type: "boolean", default: true },
      { group: "Tasarım", key: "size", label: "Etiket boyutu", type: "select", default: "md", options: sel(["sm", "Küçük"], ["md", "Orta"], ["lg", "Büyük"]) },
      { group: "Tasarım", key: "fontSize", label: "Yazı boyutu (px)", type: "number", default: 12, min: 9, max: 18 },
      { group: "Tasarım", key: "mobileFontSize", label: "Mobil yazı boyutu (px)", type: "number", default: 11, min: 9, max: 16 },
      { group: "Tasarım", key: "storeFont", label: "Mağazanın yazı tipini kullan", type: "boolean", default: true },
      { group: "Gelişmiş", key: "detailImageSelector", label: "Ürün sayfası ana görsel seçicisi (CSS)", type: "text", default: "", maxLength: 120, help: "Boş: ürün sayfasındaki en büyük ürün görseli kullanılır." },
    ],
  },
  {
    // Altyapıyı uçtan uca doğrulamak için örnek modül.
    key: "duyuru-cubugu",
    name: "Duyuru Çubuğu",
    description: "Sayfanın üstünde ya da altında kısa bir duyuru ve isteğe bağlı bağlantı gösterir.",
    fields: [
      { key: "text", label: "Metin", type: "text", default: "Tüm siparişlerde ücretsiz kargo", maxLength: 160 },
      { key: "link", label: "Bağlantı", type: "url", default: "", help: "https:// ile başlayan adres ya da / ile başlayan mağaza yolu. Boş bırakılabilir." },
      { key: "bg", label: "Arka plan", type: "color", default: "#111827" },
      { key: "color", label: "Yazı rengi", type: "color", default: "#ffffff" },
      { key: "position", label: "Konum", type: "select", default: "top", options: [{ value: "top", label: "Üstte" }, { value: "bottom", label: "Altta" }] },
      { key: "closable", label: "Kapatılabilir", type: "boolean", default: true },
    ],
  },
];

export const sfModule = (key: string) => SF_MODULES.find((m) => m.key === key);
export const defaults = (m: SfModule): Settings => Object.fromEntries(m.fields.map((f) => [f.key, f.type === "items" ? [] : f.default]));

const okUrl = (v: string) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/(?!\/)[^\s"'<>]*$/.test(v);

/** Ham girdiyi modül tanımına göre doğrular; tanımsız alanlar atılır, geçersiz değerler varsayılana döner. */
export function sanitize(m: Pick<SfModule, "fields">, raw: Record<string, unknown>): Settings {
  const out: Settings = {};
  for (const f of m.fields) {
    const v = raw[f.key];
    switch (f.type) {
      case "boolean":
        // Alan hiç gönderilmediyse (ör. sonradan eklenen alan, eksik liste kaydı) varsayılan geçerlidir; form "" gönderirse kapalıdır.
        out[f.key] = v === undefined ? f.default === true : v === true || v === "on" || v === "true";
        break;
      case "number": {
        const n = Number(v);
        out[f.key] = Number.isFinite(n) && v !== "" && v != null ? Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n)) : f.default;
        break;
      }
      case "color":
        out[f.key] = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : f.default;
        break;
      case "select":
        out[f.key] = typeof v === "string" && f.options?.some((o) => o.value === v) ? v : f.default;
        break;
      case "items": {
        let list: unknown = v;
        if (typeof v === "string") {
          try {
            list = JSON.parse(v);
          } catch {
            list = [];
          }
        }
        out[f.key] = (Array.isArray(list) ? list : [])
          .slice(0, f.maxItems ?? 20)
          .filter((x) => x && typeof x === "object")
          .map((x) => sanitize({ fields: f.of ?? [] }, x as Record<string, unknown>) as Record<string, Scalar>);
        break;
      }
      case "ids":
        // ikas kimlikleri (uuid); en fazla 200, virgülle ayrılmış.
        out[f.key] = (Array.isArray(v) ? v : String(v ?? "").split(","))
          .map((x) => String(x).trim())
          .filter((x) => /^[A-Za-z0-9-]{1,64}$/.test(x))
          .slice(0, 200)
          .join(",");
        break;
      case "datetime":
        out[f.key] = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? v : "";
        break;
      case "url": {
        const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
        out[f.key] = okUrl(s) ? s : f.default;
        break;
      }
      default:
        out[f.key] = v == null ? f.default : String(v).slice(0, f.maxLength ?? (f.type === "textarea" ? 1000 : 200));
    }
  }
  return out;
}

/** Kayıtlı JSON'u okur; bozuk ya da eski sürüm ayarlar da güvenle varsayılanlarla tamamlanır. */
export function parseSettings(m: SfModule, json: string | null | undefined): Settings {
  let raw: Record<string, unknown> = {};
  try {
    const p = JSON.parse(json ?? "{}");
    if (p && typeof p === "object") raw = p;
  } catch {}
  return sanitize(m, { ...defaults(m), ...raw });
}

/** "YYYY-MM-DDTHH:mm" Türkiye saati (UTC+3, yaz saati yok) → zaman damgası. */
export const trTime = (v: unknown) => (typeof v === "string" && v ? Date.parse(`${v}:00+03:00`) : NaN);

/** Ayarlarda startAt/endAt varsa şu an aralıkta mı (alanı olmayan modüller her zaman aktiftir). */
export function inSchedule(s: Record<string, unknown>, now = Date.now()) {
  const a = trTime(s.startAt), b = trTime(s.endAt);
  return !(a > now) && !(b <= now);
}

/** Modülün panelde gösterilen olayları. */
export const eventsOf = (m: SfModule) => (m.events ? (Object.entries(m.events) as [EventType, string][]) : EVENT_TYPES.map((t) => [t, EVENT_LABELS[t]] as [EventType, string]));

/** Herkese açık yapılandırma için gizli alanları çıkarır (liste kayıtları dahil). */
export function publicSettings(m: SfModule, s: Settings): Settings {
  const out: Settings = {};
  for (const f of m.fields) {
    if (f.private) continue;
    const v = s[f.key];
    out[f.key] = f.type === "items" && Array.isArray(v) ? v.map((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !f.of?.find((o) => o.key === k)?.private))) : v;
  }
  return out;
}
