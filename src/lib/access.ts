// Paket bazlı modül erişimi. Sayfalar, sunucu aksiyonları, API uçları ve arka plan işleri bu dosyayı kullanır.
// Deneme süresindeki hesap tüm modülleri kullanır (sitede "deneme boyunca tüm özellikler" yazıyor).
import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { MODULES, accountStatus, modulesOf, planById, type PlanId } from "./plans";

type Who = Pick<User, "plan" | "suspended" | "paidUntil" | "trialEndsAt">;

/** Hesabın fiilen kullandığı paket: denemede en geniş paket, diğer durumlarda seçili paket. */
export function effectivePlan(u: Who): PlanId {
  if (accountStatus(u, Date.now()) === "deneme") return "kurumsal";
  return planById(u.plan)?.id ?? "baslangic";
}

export const hasModule = (u: Who, moduleId: string) => modulesOf(effectivePlan(u)).some((m) => m.id === moduleId);

/** Modülün dahil olduğu en düşük paketin adı (yükseltme mesajı için). */
export function requiredPlanName(moduleId: string) {
  const m = MODULES.find((x) => x.id === moduleId);
  return planById(m?.plan)?.name ?? "üst";
}
export const moduleName = (moduleId: string) => MODULES.find((x) => x.id === moduleId)?.name ?? moduleId;

/** Sunucu aksiyonları için: modül pakette yoksa lisans sayfasına yönlendirir (istemci kontrolü atlatılsa bile). */
export function assertModule(u: Who, moduleId: string) {
  if (!hasModule(u, moduleId))
    redirect(`/lisans?hata=${encodeURIComponent(`${moduleName(moduleId)} ${requiredPlanName(moduleId)} paketinde. Kullanmak için paketinizi yükseltin.`)}`);
}

/** Rotalar → modül. Menü kilidi ve sayfa kontrolü aynı listeyi kullanır (en uzun eşleşen yol geçerlidir). */
export const ROUTE_MODULES: [string, string][] = [
  ["/otomasyonlar", "otomasyon"],
  ["/indirimler", "kampanya"],
  ["/analiz", "karlilik"],
  ["/urunler/yeni", "urun"],
  ["/urunler/toplu", "urun"],
  ["/urunler/tanimlamalar", "fiyat"],
  ["/siteler", "siteler"],
  ["/vitrin", "vitrin"],
  ["/reklam-hesaplari", "meta"],
  ["/reklam-raporu", "reklam"],
  ["/reklam", "reklam"],
];
export const moduleForPath = (path: string) =>
  ROUTE_MODULES.filter(([p]) => path === p || path.startsWith(p + "/")).sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? null;
