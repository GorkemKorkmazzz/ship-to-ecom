// Vitrin motorunun sunucu tarafı: herkese açık yapılandırma, önizleme jetonu ve olay kaydı.
import { SignJWT, jwtVerify } from "jose";
import { hasModule } from "../access";
import { secretKeyBytes } from "../crypto";
import { db } from "../db";
import { EVENT_TYPES, type EventType, type Settings, inSchedule, parseSettings, publicSettings, sfModule } from "./modules";

const PREVIEW_TYP = "sfpreview";
export const PREVIEW_PARAM = "ste_onizleme";

/** Mağazada taslağı göstermek için kısa ömürlü (30 dk) imzalı jeton. Oturum jetonu olarak kullanılamaz (typ alanı). */
export async function previewToken(storeId: string) {
  return new SignJWT({ sid: storeId, typ: PREVIEW_TYP }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30m").sign(secretKeyBytes());
}

async function previewStoreId(token: string | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKeyBytes());
    return payload.typ === PREVIEW_TYP && typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

export type PublicConfig = { preview: boolean; modules: { key: string; version: number; settings: Settings }[] };

/** Mağaza temasına gönderilen yapılandırma. Paket modülü kapsamıyorsa boş döner (mağazada hiçbir şey çalışmaz). */
export async function publicConfig(sfKey: string, token: string | null): Promise<PublicConfig | null> {
  const store = await db.store.findUnique({
    where: { sfKey },
    select: { id: true, user: { select: { plan: true, suspended: true, paidUntil: true, trialEndsAt: true } }, sfModules: true },
  });
  if (!store) return null;
  const preview = (await previewStoreId(token)) === store.id;
  if (!hasModule(store.user, "vitrin") || store.user.suspended) return { preview, modules: [] };
  const modules = store.sfModules.flatMap((r) => {
    const m = sfModule(r.moduleKey);
    if (!m) return [];
    if (preview) return r.enabled || r.draft != null ? [{ key: m.key, version: r.version, settings: publicSettings(m, parseSettings(m, r.draft ?? r.settings)) }] : [];
    if (!r.enabled) return [];
    const settings = parseSettings(m, r.settings);
    // Liste alanlarındaki (ör. mesajlar) süresi dolmuş, başlamamış ya da pasif kayıtlar ayıklanır.
    for (const f of m.fields) if (f.type === "items") settings[f.key] = (settings[f.key] as Record<string, unknown>[]).filter((x) => inSchedule(x) && x.active !== false) as typeof settings[string];
    // Tarih aralığı dışındaki modül hiç gönderilmez (önizlemede tarih yok sayılır).
    return inSchedule(settings) ? [{ key: m.key, version: r.version, settings: publicSettings(m, settings) }] : [];
  });
  return { preview, modules };
}

const day = () => new Date().toISOString().slice(0, 10);

/** Tarayıcıdan gelen olay paketi. Yalnızca mağazada açık modüllerin bilinen olayları sayılır. */
export async function recordEvents(sfKey: string, body: unknown) {
  const list = Array.isArray((body as { e?: unknown })?.e) ? ((body as { e: unknown[] }).e).slice(0, 20) : [];
  if (!list.length) return 0;
  const store = await db.store.findUnique({ where: { sfKey }, select: { id: true, sfModules: { where: { enabled: true }, select: { moduleKey: true } } } });
  if (!store) return 0;
  const active = new Set(store.sfModules.map((m) => m.moduleKey));
  const agg = new Map<string, { moduleKey: string; type: EventType; count: number; value: number }>();
  for (const x of list) {
    const { m, t, v } = (x ?? {}) as { m?: unknown; t?: unknown; v?: unknown };
    if (typeof m !== "string" || !active.has(m) || !EVENT_TYPES.includes(t as EventType)) continue;
    const value = t === "convert" && typeof v === "number" && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1_000_000) : 0;
    const k = `${m}|${t}`;
    const cur = agg.get(k) ?? { moduleKey: m, type: t as EventType, count: 0, value: 0 };
    cur.count += 1;
    cur.value += value;
    agg.set(k, cur);
  }
  const d = day();
  await db.$transaction(
    [...agg.values()].map((a) =>
      db.moduleStat.upsert({
        where: { storeId_moduleKey_day_type: { storeId: store.id, moduleKey: a.moduleKey, day: d, type: a.type } },
        create: { storeId: store.id, moduleKey: a.moduleKey, day: d, type: a.type, count: a.count, value: a.value },
        update: { count: { increment: a.count }, value: { increment: a.value } },
      }),
    ),
  );
  return agg.size;
}

/** Basit IP başına hız sınırı (tek sunucu örneği varsayar; çok örnekte paylaşımlı depoya taşınmalı). */
const hits = new Map<string, { n: number; at: number }>();
export function rateLimited(ip: string, max = 120) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    if (hits.size > 10_000) for (const [k, x] of hits) if (now - x.at > 60_000) hits.delete(k);
    return false;
  }
  return ++h.n > max;
}

/** Son `days` gündeki modül toplamları: { modül: { view, click, use, convert, value } }. */
export async function moduleTotals(storeId: string, days = 30) {
  const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.moduleStat.groupBy({ by: ["moduleKey", "type"], where: { storeId, day: { gte: since } }, _sum: { count: true, value: true } });
  const out: Record<string, Record<EventType, number> & { value: number }> = {};
  for (const r of rows) {
    const t = (out[r.moduleKey] ??= { view: 0, click: 0, use: 0, convert: 0, value: 0 });
    if (EVENT_TYPES.includes(r.type as EventType)) t[r.type as EventType] = r._sum.count ?? 0;
    if (r.type === "convert") t.value = r._sum.value ?? 0;
  }
  return out;
}
