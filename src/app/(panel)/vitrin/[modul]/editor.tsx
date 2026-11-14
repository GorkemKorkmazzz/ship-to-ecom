"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Field, type Scalar, type Settings, inSchedule, sanitize, sfModule } from "@/lib/storefront/modules";
import { saveModule } from "../actions";

// Örnek mağaza sayfası: barın tema içindeki konumu (üst menü, içerik, alt) görülebilsin diye.
const PAGE = `<header style="position:sticky;top:0;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:#fff;border-bottom:1px solid #e5e7eb"><b>MAĞAZA</b><span style="color:#6b7280;font-size:13px">Kategoriler · Sepet</span></header>
<main style="display:flex;flex-wrap:wrap;gap:24px;padding:20px"><div style="flex:1 1 280px;height:320px;border-radius:8px;background:#e5e7eb"></div>
<div style="flex:1 1 280px"><h1 class="product-name" style="margin:0 0 8px;font-size:22px">Örnek Ürün</h1><div class="product-detail-page-detail-price-box" style="font-size:20px;font-weight:600">₺ 900,00</div>
<div style="display:flex;margin-top:16px"><button class="add-to-cart" style="flex:1;padding:12px;border:0;border-radius:6px;background:#111827;color:#fff;font-weight:600">SEPETE EKLE</button></div>
<p style="color:#6b7280;font-size:13px;line-height:1.6">Ürün açıklaması örneği. Gerçek görünüm temaya göre değişebilir.</p></div></main>`;

/** Form verisini modül ayarına çevirir (sunucudaki doğrulamanın aynısı). */
function read(form: HTMLFormElement, fields: Field[]) {
  const fd = new FormData(form);
  return Object.fromEntries(fields.map((f) => [f.key, f.type === "boolean" ? (fd.get(f.key) ? "on" : "") : f.type === "ids" ? fd.getAll(f.key).join(",") : fd.get(f.key)]));
}

export type Sources = { products: { id: string; name: string }[]; categories: { id: string; name: string }[]; variants: { id: string; name: string }[] };

/** Tek bir alt alanın kontrollü girişi (liste kayıtları için). */
function SubInput({ f, v, set, sources }: { f: Field; v: Scalar; set: (v: Scalar) => void; sources: Sources }) {
  const label = <span className="label">{f.label}</span>;
  const help = f.help && <span className="mt-1 block text-xs text-gray-500">{f.help}</span>;
  if (f.type === "ids") {
    const opts = f.source ? sources[f.source] : [];
    const chosen = String(v).split(",").filter(Boolean);
    return (
      <label className="block">{label}
        <select multiple className="input h-32" value={chosen} onChange={(e) => set([...e.target.selectedOptions].map((o) => o.value).join(","))}>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-gray-500">{opts.length ? `${chosen.length} seçili · Ctrl/Cmd ile birden fazla seçin.` : "Liste ikas'tan alınamadı ya da boş."}</span>
      </label>
    );
  }
  if (f.type === "boolean")
    return <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={v === true} onChange={(e) => set(e.target.checked)} /> {f.label}</label>;
  if (f.type === "select")
    return <label className="block">{label}<select className="input" value={String(v)} onChange={(e) => set(e.target.value)}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{help}</label>;
  return (
    <label className="block">{label}
      <input className="input" value={String(v)} maxLength={f.maxLength} type={f.type === "datetime" ? "datetime-local" : f.type === "number" ? "number" : "text"} min={f.min} max={f.max} onChange={(e) => set(e.target.value)} />
      {f.type === "text" && f.maxLength && <span className="mt-1 block text-right text-xs text-gray-400">{String(v).length}/{f.maxLength}</span>}
      {help}
    </label>
  );
}

/** Tekrar eden kayıtlar (ör. Bilgi Şeridi mesajları): ekle, şablondan ekle, sırala, sil. Değer gizli alanda JSON olarak gönderilir. */
function ItemsInput({ f, initial, sources, onChange }: { f: Field; initial: Record<string, Scalar>[]; sources: Sources; onChange: () => void }) {
  const of = f.of ?? [];
  const blank = () => Object.fromEntries(of.map((x) => [x.key, x.default])) as Record<string, Scalar>;
  const [list, setList] = useState(initial);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) first.current = false;
    else onChange();
  }, [list, onChange]);
  const max = f.maxItems ?? 20;
  const put = (i: number, k: string, v: Scalar) => setList((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => setList((l) => { const n = [...l]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  return (
    <div className="space-y-3">
      <input type="hidden" name={f.key} value={JSON.stringify(list)} />
      {list.map((it, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm">{i + 1}. {f.key === "messages" ? "mesaj" : "kayıt"}{it.ikasId ? " · ikas'ta kayıtlı" : ""}</b>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Yukarı taşı">↑</button>
              <button type="button" className="btn-ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Aşağı taşı">↓</button>
              <button type="button" className="btn-ghost text-red-600" onClick={() => setList((l) => l.filter((_, j) => j !== i))}>Sil</button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {of.filter((x) => !x.hidden).filter((x) => !x.showIf || String(it[x.showIf[0]]) === x.showIf[1]).map((x) => (
              <div key={x.key} className={x.type === "ids" || x.key === "text" ? "sm:col-span-2" : ""}><SubInput f={x} v={it[x.key] ?? x.default} set={(v) => put(i, x.key, v)} sources={sources} /></div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" disabled={list.length >= max} onClick={() => setList((l) => [...l, blank()])}>Yeni ekle</button>
        {f.templates?.map((t) => (
          <button key={t.label} type="button" className="btn-ghost" disabled={list.length >= max} onClick={() => setList((l) => [...l, { ...blank(), ...t.values }])}>+ {t.label}</button>
        ))}
        <span className="text-xs text-gray-500">{list.length}/{max}</span>
      </div>
    </div>
  );
}

function Input({ f, v, sources }: { f: Field; v: Scalar; sources: Sources }) {
  if (f.type === "ids") {
    const opts = f.source ? sources[f.source] : [];
    return (
      <label className="block"><span className="label">{f.label}</span>
        <select multiple name={f.key} className="input h-36" defaultValue={String(v).split(",").filter(Boolean)}>
          {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <span className="mt-1 block text-xs text-gray-500">{opts.length ? "Ctrl/Cmd ile birden fazla seçin." : "Liste ikas'tan alınamadı ya da boş."}</span>
      </label>
    );
  }
  if (f.type === "boolean")
    return (
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name={f.key} defaultChecked={v === true} className="mt-0.5" />
        <span>{f.label}{f.help && <span className="block text-xs text-gray-500">{f.help}</span>}</span>
      </label>
    );
  const common = { name: f.key, defaultValue: String(v) };
  const input =
    f.type === "select" ? (
      <select className="input" {...common}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    ) : f.type === "textarea" ? (
      <textarea className="input" {...common} maxLength={f.maxLength ?? 1000} rows={3} />
    ) : f.type === "color" ? (
      <input className="h-10 w-20 cursor-pointer rounded border" type="color" {...common} />
    ) : (
      <input className="input" {...common} type={f.type === "number" ? "number" : f.type === "datetime" ? "datetime-local" : "text"} min={f.min} max={f.max} maxLength={f.maxLength} />
    );
  return <label className="block"><span className="label">{f.label}</span>{input}{f.help && <span className="mt-1 block text-xs text-gray-500">{f.help}</span>}</label>;
}

export function Editor({ moduleKey, storeId, initial, version, loader, hasDraft, sources, previewData }: { moduleKey: string; storeId: string; initial: Settings; version: number; loader: string; hasDraft: boolean; sources: Sources; previewData?: unknown }) {
  const mod = sfModule(moduleKey)!;
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<"desk" | "mob">("desk");
  const [settings, setSettings] = useState(initial);
  const [dirty, setDirty] = useState(false);
  // Masaüstü görünümü gerçek bir masaüstü genişliğinde (1280 px) çizilip kutuya sığacak kadar küçültülür; böylece mobil kırılıma düşmez.
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = device === "mob" ? 375 : 1280, H = 640;
  const scale = boxW ? Math.min(1, boxW / W) : 1;

  const cfg = (s: Settings) => ({ preview: true, modules: [{ key: mod.key, version, settings: s, data: previewData }] });
  // srcDoc yalnızca ilk ayarla kurulur; sonraki değişiklikler postMessage ile gider (çerçeve yeniden yüklenmez).
  const [srcDoc] = useState(() => {
    const json = JSON.stringify(cfg(initial)).replace(/</g, "\\u003c").replace(/'/g, "&#39;");
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;font-family:system-ui;background:#f9fafb">${PAGE}<script data-editor data-config='${json}'>${loader.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
  });

  const formRef = useRef<HTMLFormElement>(null);
  function update(form: HTMLFormElement | null) {
    if (!form) return;
    const s = sanitize(mod, read(form, mod.fields));
    setSettings(s);
    setDirty(true);
    frame.current?.contentWindow?.postMessage({ ste: "cfg", cfg: cfg(s) }, "*");
  }

  const onItems = useCallback(() => update(formRef.current), []); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = [...new Set(mod.fields.map((f) => f.group ?? ""))];
  const scheduled = inSchedule(settings);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form ref={formRef} action={saveModule} onInput={(e) => update(e.currentTarget)} onChange={(e) => update(e.currentTarget)} className="space-y-4">
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="moduleKey" value={mod.key} />
        {groups.map((g) => (
          <section key={g} className="card space-y-3">
            {g && <h2 className="font-semibold">{g}</h2>}
            {mod.fields.filter((f) => (f.group ?? "") === g).map((f) =>
              f.type === "items" ? (
                <ItemsInput key={f.key} f={f} initial={initial[f.key] as Record<string, Scalar>[]} sources={sources} onChange={onItems} />
              ) : (
                <div key={f.key} hidden={!!f.showIf && String(settings[f.showIf[0]]) !== f.showIf[1]}><Input f={f} v={initial[f.key] as Scalar} sources={sources} /></div>
              ),
            )}
          </section>
        ))}
        <div className="card sticky bottom-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost" name="_op" value="taslak">Taslağı kaydet</button>
          <button className="btn" name="_op" value="yayinla">Yayınla</button>
          {hasDraft && <button className="btn-ghost" name="_op" value="sifirla" formNoValidate>Taslağı sil</button>}
          <span className="text-xs text-gray-500">{dirty ? "Kaydedilmemiş değişiklik var." : hasDraft ? "Yayınlanmamış taslak gösteriliyor." : "Yayındaki ayarlar gösteriliyor."}</span>
        </div>
      </form>
      <section className="card space-y-3 xl:sticky xl:top-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Canlı önizleme</h2>
          <div className="flex gap-1" role="group" aria-label="Görünüm">
            <button type="button" className={device === "desk" ? "btn" : "btn-ghost"} onClick={() => setDevice("desk")} aria-pressed={device === "desk"}>Masaüstü</button>
            <button type="button" className={device === "mob" ? "btn" : "btn-ghost"} onClick={() => setDevice("mob")} aria-pressed={device === "mob"}>Mobil</button>
          </div>
        </div>
        <div ref={box} className="overflow-hidden rounded-lg bg-gray-100" style={{ height: H * scale }}>
          <iframe
            ref={frame}
            title="Canlı önizleme"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            onLoad={() => frame.current?.contentWindow?.postMessage({ ste: "cfg", cfg: cfg(settings) }, "*")}
            className="origin-top-left border bg-white"
            style={{ width: W, height: H, transform: `translateX(${Math.max(0, (boxW - W * scale) / 2)}px) scale(${scale})` }}
          />
        </div>
        <ul className="space-y-1 text-xs text-gray-500">
          <li>Önizlemede tarih, sayfa ve ürün/kategori hedeflemesi uygulanmaz (tüm kayıtlar gösterilir); cihaz kuralı seçili görünüme göre uygulanır.</li>
          {!scheduled && <li className="text-amber-700">Seçilen tarih aralığı şu an dışında: yayınlansa bile mağazada şu an görünmez.</li>}
          <li>Kapatma tuşu önizlemede yalnızca bu görünümü kapatır; kaydettiğinizde ya da ayar değiştirdiğinizde bar geri gelir.</li>
        </ul>
      </section>
    </div>
  );
}
