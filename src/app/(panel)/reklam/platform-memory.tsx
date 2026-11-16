"use client";

import { useEffect } from "react";

/** Son seçilen reklam platformunu çerezde saklar; ?platform verilmeden açılan reklam sayfaları bu seçimle açılır. */
export function PlatformMemory({ platform }: { platform: string }) {
  useEffect(() => {
    document.cookie = `ad_platform=${platform}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [platform]);
  return null;
}
