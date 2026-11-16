// Reklam alanının merkezi platform seçimi. Tüm reklam sayfaları platformu buradan çözer:
// 1) URL ?platform=meta|google  2) son seçim çerezi (ad_platform)  3) varsayılan: meta.
// Meta ve Google verileri hiçbir sayfada birlikte toplanmaz.
import { cookies } from "next/headers";
import { db } from "../db";

export const AD_PLATFORMS = ["meta", "google"] as const;
export type AdPlatform = (typeof AD_PLATFORMS)[number];
export const PLATFORM_COOKIE = "ad_platform";
export const isPlatform = (v: unknown): v is AdPlatform => v === "meta" || v === "google";

export async function resolveAdPlatform(param?: string | null): Promise<AdPlatform> {
  if (isPlatform(param)) return param;
  const c = (await cookies()).get(PLATFORM_COOKIE)?.value;
  return isPlatform(c) ? c : "meta";
}

/** Bağlantı durumu, yalnızca kayıtlı entegrasyon ve hesaplardan okunur. */
export type ConnState = "bagli" | "bekliyor" | "yok" | "hata";
export const CONN_LABEL: Record<ConnState, string> = { bagli: "Bağlı", bekliyor: "Bağlantı bekleniyor", yok: "Bağlantı yok", hata: "Bağlantı hatası" };

export async function adConnections(userId: string) {
  const integ = await db.adIntegration.findMany({
    where: { userId, provider: { in: [...AD_PLATFORMS] } },
    select: { provider: true, status: true, externalUserId: true, lastError: true, accounts: { select: { selected: true, metricsError: true } } },
  });
  const out = {} as Record<AdPlatform, { state: ConnState; demo: boolean; detail: string | null }>;
  for (const p of AD_PLATFORMS) {
    const list = integ.filter((i) => i.provider === p);
    const active = list.filter((i) => i.status === "active");
    const demo = list.length > 0 && list.every((i) => i.externalUserId.startsWith("demo-"));
    let state: ConnState, detail: string | null = null;
    if (!list.length) state = "yok";
    else if (!active.length) { state = "hata"; detail = list.find((i) => i.lastError)?.lastError ?? "Yetki süresi doldu ya da iptal edildi; yeniden bağlayın."; }
    else if (!active.some((i) => i.accounts.some((a) => a.selected))) { state = "bekliyor"; detail = "Bağlantı var ama raporlamaya dahil edilmiş reklam hesabı seçilmedi."; }
    else {
      state = "bagli";
      const err = active.flatMap((i) => i.accounts).find((a) => a.selected && a.metricsError)?.metricsError;
      if (err) detail = `Son senkronda hata: ${err}`;
    }
    out[p] = { state, demo, detail };
  }
  return out;
}
export type AdConnections = Awaited<ReturnType<typeof adConnections>>;
