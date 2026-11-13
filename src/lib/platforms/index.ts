import type { Store } from "@prisma/client";
import { ikasAdapter } from "./ikas";
import { tsoftAdapter } from "./tsoft";
import type { PlatformAdapter, PlatformId } from "./types";

const ADAPTERS: Record<PlatformId, PlatformAdapter> = { ikas: ikasAdapter, tsoft: tsoftAdapter };

/** Mağazanın platform adaptörü. Bilinmeyen platform hata verir (yanlış API'ye istek gitmesin). */
export function adapterFor(store: Pick<Store, "platform">): PlatformAdapter {
  const a = ADAPTERS[store.platform as PlatformId];
  if (!a) throw new Error(`Desteklenmeyen platform: ${store.platform}`);
  return a;
}

/** Panelde gösterilen mağaza adresi (ör. magazam.myikas.com ya da magaza.com). */
export const storeHost = (store: Store) => adapterFor(store).host(store);
export const platformName = (store: Pick<Store, "platform">) => adapterFor(store).name;
export const isIkas = (store: Pick<Store, "platform">) => store.platform === "ikas";
