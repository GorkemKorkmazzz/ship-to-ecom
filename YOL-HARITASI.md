# ShipToEcom — uçtan uca yol haritası

Durum tarihi: 13 Kasım 2026. Bu belge, projenin bugünkü halini ve yayına kadar kalan işleri sırasıyla listeler.

## Bugünkü durum

| Katman | Durum |
| --- | --- |
| Arayüz (28 rota) | Hazır; tüm sayfalar gerçek veriyle çalışıyor, sahte veri kullanan sayfa yok |
| Backend (`src/lib`, sunucu aksiyonları, 2 API rotası) | Bağlı; her sayfa ve form bir aksiyona ya da sorguya bağlı |
| Veritabanı | Yerelde SQLite (`prisma/dev.db`), şema ile uyumlu; 14 tablo |
| ikas entegrasyonu | İki mağaza bağlı (`dev-atest`, `dev-btest`); son senkron hatasız (12 Kasım) |
| Webhook | Kurulu değil — `APP_URL` https olmadan kurulamaz |
| Önbellek | Etkin (`src/lib/cache.ts`) |
| Ödeme | Yalnızca havale/EFT; backofisten elle onay |
| Otomatik test | Yalnızca stok hesabı ve fiyat kuralı (`npm test`) |

## Önbellek nasıl çalışıyor

| Veri | Yöntem | Süre | Ne zaman düşer |
| --- | --- | --- | --- |
| Oturumdaki kullanıcı, mağaza listesi | İstek içi tekilleştirme | Tek istek | Her istekte yeniden okunur |
| Rapor verisi, pano grafiği | `unstable_cache`, etiket `user:<id>` | 5 dk | Senkron bitince, sipariş silme/geri alma, mağaza kaldırma |
| ikas kampanya listesi | `unstable_cache`, etiket `campaigns:<mağaza>` | 60 sn | Kampanya ekleme/silme |
| Stok, sipariş listesi, ürünler, kayıtlar | Önbellek yok | — | Her zaman veritabanından |

Stok ve sipariş ekranları bilerek önbelleğe alınmadı: yanlış stok göstermek fazla satışa yol açar.

## Faz 1 — Yayın öncesi zorunlular

1. **PostgreSQL'e geçiş.** `prisma/schema.prisma` içinde `provider = "postgresql"`, `DATABASE_URL` güncellenir. Şu an `db push` kullanılıyor; yayında `prisma migrate` ile sürümlü göç dosyalarına geçilmeli. SQLite'taki veri taşınacaksa ayrı bir aktarım betiği gerekir.
2. **Barındırma kararı.** Senkron kilidi (`src/lib/sync.ts`) ve önbellek tek sunucu örneği varsayar. Tek bir Node sunucusunda (VPS, Railway, Fly) olduğu gibi çalışır. Vercel gibi çok örnekli ortamda önce Faz 2'deki 1. ve 2. madde yapılmalı.
3. **Ortam değişkenleri.** `APP_SECRET` (kaybedilirse kayıtlı ikas secret'ları çözülemez — yedeklenmeli), `APP_URL` (https), `CRON_SECRET`, `ADMIN_SETUP_KEY`, banka bilgileri.
4. **Webhook kurulumu.** Yayındaki adresle Mağazalar ekranından "Webhook kur".
5. **Cron.** `/api/cron/sync` 5–10 dakikada bir `Authorization: Bearer $CRON_SECRET` ile çağrılmalı.
6. **ikas doğrulamaları.** README'nin "Yayına almadan önce" bölümündeki maddeler gerçek test mağazasında tek tek denenmeli (stok mutlak değer mi yazılıyor, sipariş durum değerleri, görsel yükleme, kampanya girdisi).

## Faz 2 — Ölçek ve dayanıklılık

1. Senkron kilidini veritabanı kilidine çevir (PostgreSQL advisory lock).
2. Önbelleği paylaşımlı yap: Next `cacheHandler` ile Redis.
3. Cron rotası kullanıcıları sırayla senkronlar; kullanıcı sayısı artınca kuyruk ya da paralel işleyiciye taşı.
4. Giriş, kayıt ve webhook uçlarına hız sınırı.
5. Hata izleme (Sentry benzeri) ve senkron hataları için e-posta/bildirim.
6. Veritabanı yedekleme ve geri yükleme denemesi.

## Faz 3 — Ürün eksikleri

1. Kartla ödeme (iyzico/PayTR); şema `method = "kart"` değerini zaten tanıyor.
2. Şifre sıfırlama ve e-posta doğrulama (şu an yok).
3. Paket sınırlarının uygulanması (ürün/sipariş sayısına göre).
4. Düşük stok uyarılarının e-postayla gönderimi.
5. İkiden fazla mağaza desteği (arayüzde renk ve kural mantığı iki mağazaya göre yazılmış).

## Faz 4 — Kalite

1. Senkron için sahte ikas API'siyle (`npm run mock`) uçtan uca test.
2. Sunucu aksiyonları için entegrasyon testleri.
3. CI: `tsc`, `eslint`, `npm test`, `next build`.
