"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kreatif önizlemesi. Görsel yoksa ya da yüklenemezse (ör. süreli adresin süresi dolmuşsa) bozuk görsel yerine yer tutucu
 * ve nedeni gösterilir. Görsel adresleri her senkronda yenilenir.
 */
export function CreativeThumb({ src, alt, type, videoId, provider, className = "aspect-square", compact = false }: { src: string | null; alt: string; type: string | null; videoId?: string | null; provider: string; className?: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // Görsel React yüklenmeden önce hata verdiyse onError kaçırılır; yüklenmiş ama boyutsuz görsel de başarısız sayılır.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);
  const show = src && !failed;
  const label = !src ? (type === "TEXT" ? "Metin reklamı" : type === "DISPLAY" ? "Duyarlı görüntülü reklam" : "Önizleme verisi yok") : "Görsel yüklenemedi";
  const hint = !src ? (type === "TEXT" ? "Arama reklamlarında görsel yoktur." : provider === "google" && videoId ? "YouTube videosu (küçük resim API'den gelmez)." : "Platform bu reklam için görsel adresi döndürmedi.") : "Adresin süresi dolmuş olabilir; sonraki senkronda yenilenir.";
  return (
    <div className={`relative overflow-hidden bg-gray-100 ${className}`}>
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- dış platform adresleri (Meta/Google CDN), Next görsel optimizasyonu dışında
        <img ref={img} src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        <div className={`flex h-full w-full flex-col items-center justify-center text-center text-gray-400 ${compact ? "p-1" : "gap-1 p-3"}`} title={`${label}. ${hint}`}>
          <svg viewBox="0 0 24 24" className={compact ? "h-5 w-5" : "h-8 w-8"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {type === "VIDEO" ? <path d="M4 6h11v12H4zM15 10l5-3v10l-5-3" /> : type === "TEXT" ? <path d="M4 6h16M4 10h12M4 14h16M4 18h9" /> : <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9h.01" />}
          </svg>
          {!compact && <span className="text-xs font-medium text-gray-500">{label}</span>}
          {!compact && <span className="text-[11px] leading-tight">{hint}</span>}
          {!compact && provider === "google" && videoId && <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium text-indigo-600 underline">Videoyu YouTube&apos;da aç</a>}
        </div>
      )}
    </div>
  );
}
