// Sunucuyla konuşan tek yer: adres, oturum anahtarı ve /api/mobile uçları.
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "ste_token";
const SERVER_KEY = "ste_server";

// Oturum anahtarı telefonda Anahtar Zinciri'nde saklanır; tarayıcı önizlemesinde yerel depoda.
const store = {
  get: async (k: string) => (Platform.OS === "web" ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === "web" ? void globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === "web" ? void globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

/** Geliştirmede sunucu, Expo'nun çalıştığı bilgisayardır (aynı Wi-Fi); panel 3000 portunda. */
export function defaultServer(): string {
  const host =
    Platform.OS === "web"
      ? globalThis.location?.hostname
      : Constants.expoConfig?.hostUri?.split(":")[0] ?? Constants.expoGoConfig?.debuggerHost?.split(":")[0];
  return `http://${host || "localhost"}:3000`;
}

let server = defaultServer();
let token: string | null = null;
let onExpired: (() => void) | null = null;

export const getServer = () => server;
export const setOnExpired = (fn: () => void) => void (onExpired = fn);

/** Uygulama açılışında kayıtlı adresi ve oturumu yükler; oturum varsa true döner. */
export async function restore(): Promise<boolean> {
  server = (await store.get(SERVER_KEY)) || defaultServer();
  token = await store.get(TOKEN_KEY);
  return !!token;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${server}/api/mobile${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new ApiError(`Sunucuya ulaşılamadı (${server}). Telefon ve bilgisayar aynı Wi-Fi'da mı?`, 0);
  }
  const json = (await res.json().catch(() => null)) as (T & { hata?: string }) | null;
  if (res.status === 401 && token) {
    await logout();
    onExpired?.();
  }
  if (!res.ok || !json) throw new ApiError(json?.hata ?? `Sunucu hatası (HTTP ${res.status}).`, res.status);
  return json;
}

export async function login(serverUrl: string, email: string, password: string) {
  server = serverUrl.trim().replace(/\/+$/, "") || defaultServer();
  const r = await call<{ token: string }>("/giris", { method: "POST", body: JSON.stringify({ email, password }) });
  token = r.token;
  await store.set(TOKEN_KEY, r.token);
  await store.set(SERVER_KEY, server);
}

export async function logout() {
  token = null;
  await store.del(TOKEN_KEY);
}

// ───────────── Yanıt tipleri (src/app/api/mobile ile aynı) ─────────────
export type Tone = "green" | "amber" | "red" | "gray" | "sky";
export type Status = { code: string; label: string; tone: Tone } | null;
export type Me = {
  email: string; paket: string; durum: string; magazaHakki: number; sonSenkron: string | null;
  magazalar: { id: string; ad: string; adres: string; platform: string; sonSenkron: string | null; hata: string | null }[];
};
export type Summary = {
  gun: number; paraBirimi: string; sonSenkron: string | null;
  toplam: { ciro: number; siparis: number; adet: number; ortalama: number };
  gunler: string[];
  magazalar: { id: string; ad: string; ciro: number; siparis: number; seri: number[]; hata: string | null }[];
  enCokSatanlar: { sku: string; ad: string; adet: number; ciro: number }[];
  stok: { ortak: number; dusuk: number; tukenen: number };
};
export type Order = {
  id: string; numara: string; magaza: { id: string; ad: string }; tarih: string | null; tutar: number; paraBirimi: string;
  durum: Status; odeme: Status; paket: Status; kargoYontemi: string | null; il: string | null; ilce: string | null;
  kargolar: { numara: string; barkod: string | null; firma: string | null; takipNo: string | null; takipLinki: string | null }[];
  satirlar: { sku: string; ad: string; adet: number; fiyat: number | null; gorsel: string | null }[];
};
export type Orders = { sayfa: number; sayfaSayisi: number; toplam: number; filtreler: { anahtar: string; ad: string }[]; siparisler: Order[] };
export type StockRow = { sku: string; ad: string; ortak: number | null; magazalar: { id: string; ad: string; stok: number | null }[]; dusuk: boolean; haric: boolean };
export type Stock = { sayfa: number; sayfaSayisi: number; toplam: number; sayilar: { tum: number; dusuk: number; tukenen: number; eslesmeyen: number }; urunler: StockRow[] };

export type ReportRow = { ad: string; adet: number; tutar: number };
export type Report = {
  gun: number; paraBirimi: string; magazalar: { id: string; ad: string }[];
  ozet: { ciro: number; siparis: number; ortalama: number; indirim: number; terkEdilenSepet: number };
  raporAlaniVar: boolean;
  gruplar: { baslik: string; bolumler: { baslik: string; ipucu?: string; birim: string; satirlar: ReportRow[] }[] }[];
};

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join("&")}` : "";
};

export const api = {
  me: () => call<Me>("/ben"),
  summary: (gun: number, magaza?: string) => call<Summary>(`/ozet${qs({ gun, magaza })}`),
  orders: (o: { durum?: string; q?: string; sayfa?: number }) => call<Orders>(`/siparisler${qs(o)}`),
  report: (gun: number, magaza?: string) => call<Report>(`/raporlar${qs({ gun, magaza })}`),
  stock: (o: { f?: string; q?: string; sayfa?: number }) => call<Stock>(`/stok${qs(o)}`),
  sync: () => call<{ tamam: boolean; sonSenkron: string | null; hatalar: string[] }>("/senkron", { method: "POST" }),
};
