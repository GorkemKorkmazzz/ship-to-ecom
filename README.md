# ShipToEcom — iki ikas mağazası için ortak stok ve sipariş paneli

İki ikas mağazasını bağlar; aynı SKU'lu ürünler tek stoktan düşer, siparişler mağaza etiketiyle tek listede görünür.
Müşteri bilgileri (ad, e-posta, telefon, adres) ikas'tan hiç istenmez ve saklanmaz.

## Çalıştırma

```bash
npm install
npx prisma db push
npm run dev
```

`.env.example` dosyasını `.env` olarak kopyalayıp doldurun.

## Gerçek mağaza olmadan deneme

```bash
npm run mock
IKAS_GRAPHQL_URL=http://localhost:4010/graphql IKAS_TOKEN_URL="http://localhost:4010/{store}/token" IKAS_IMAGE_URL=http://localhost:4010/image npm run dev
```

Bu iki komut yalnızca sahte API ile deneme içindir; gerçek mağazalar için düz `npm run dev` kullanın.

Mağaza adları `magaza-a` ve `magaza-b`; Client ID/Secret herhangi bir değer olabilir.
Sipariş simülasyonu: `curl -X POST "localhost:4010/_order?store=magaza-a&sku=TS-001&qty=2"`

## Nasıl çalışır

- `src/lib/reconcile.ts` — ortak stok hesabı (`npm test`).
- `src/lib/sync.ts` — ürünleri okur, ortak stoğu hesaplar, iki mağazaya yazar, siparişleri çeker.
- `src/lib/ikas.ts` — ikas Admin API istemcisi.
- `src/lib/cache.ts` — önbellek: rapor/pano toplamları (5 dk) ve ikas kampanya listesi (60 sn); senkron ve panel işlemleri etiketi hemen düşürür. Stok, sipariş ve ürün tabloları önbelleğe alınmaz.
- `src/lib/product.ts` + `/urunler/yeni` — tek formdan seçili mağazalarda aynı SKU ile ürün oluşturur (marka/kategori/etiket/varyant tipi yoksa mağazada açılır).
- `/urunler` — ürün/fiyat listesi ve otomatik fiyat kuralı (`src/lib/pricing.ts`): bir mağazanın fiyatı diğerinden yüzde/sabit farkla hesaplanır, her senkronda yazılır.
- `/indirimler` — ikas kampanyalarını (yüzde, tutar, ücretsiz kargo, kuponlu) seçili mağazalarda oluşturur/siler; liste doğrudan ikas'tan okunur.
- `/siparisler` — durum filtreleri, ürün görselleri ve ikas paketlerinden gelen kargo barkodu/takip bilgisi.
- `/api/webhooks/ikas/[storeId]/[secret]` — ikas bildirimi gelince senkronu tetikler (gövde okunmaz).
- `/api/cron/sync` — periyodik güvenlik ağı; `Authorization: Bearer $CRON_SECRET` ile 5–10 dakikada bir çağrılmalı.

## Yayına almadan önce

- `prisma/schema.prisma` içinde `provider = "postgresql"` yapın.
- `APP_URL` https adresi olmalı; sonra Mağazalar ekranından "Webhook kur".
- Gerçek bir ikas test mağazasında doğrulanacaklar: `saveProductStockLocations` mutlak değer mi yazıyor, webhook imza başlığı, sipariş durum değerleri, ürün eklemede varyant tipi `selectionType: "CHOICE"` değeri ve görsel yükleme; görsel CDN adresi kalıbı (`cdn.myikas.com/images/{merchantId}/{imageId}/image_180.webp`), `saveVariantPrices` ile indirimli fiyatın `null` gönderilerek kaldırılması, kampanya girdisi.
