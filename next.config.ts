import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Yalnızca yerel test için: ikinci bir dev sunucusu ayrı klasörle çalışabilsin.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR, allowedDevOrigins: ["127.0.0.1"] } : {}),
  // Panel tamamen oturuma bağlı ve dinamik; statik ön-oluşturma (Cache Components) kullanılmıyor.
  // Ürün ekleme formunda görsel dosyaları sunucu aksiyonuyla gönderilir.
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
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
