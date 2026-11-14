import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yalnızca yerel test için: ikinci bir dev sunucusu ayrı klasörle çalışabilsin.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR, allowedDevOrigins: ["127.0.0.1"] } : {}),
  // Panel tamamen oturuma bağlı ve dinamik; statik ön-oluşturma (Cache Components) kullanılmıyor.
  // Veri önbelleği src/lib/cache.ts içinde (unstable_cache + etiketle geçersiz kılma).
  // Ürün ekleme formunda görsel dosyaları sunucu aksiyonuyla gönderilir.
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
  // Yalnızca geliştirmede: mobil uygulamanın tarayıcı önizlemesi (Expo web, başka port) mobil API'ye erişebilsin.
  // Telefon uygulaması tarayıcı olmadığı için buna ihtiyaç duymaz; yayında başlık eklenmez.
  ...(process.env.NODE_ENV !== "production"
    ? {
        async headers() {
          return [
            {
              source: "/api/mobile/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: "*" },
                { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type, Accept" },
                { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
              ],
            },
          ];
        },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
