"use client";

import { useState } from "react";

/** Ürün küçük görseli; adres yoksa veya yüklenemezse nötr bir kutu gösterir. */
export function Thumb({ src, alt, size = 40 }: { src: string | null; alt: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (!src || broken) {
    return (
      <span style={box} className="flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-gray-400" title={alt}>
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} title={alt} style={box} loading="lazy" onError={() => setBroken(true)} className="shrink-0 rounded-md border border-gray-200 bg-white object-cover" />;
}
