"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { connectIkas, testIkasConnection, type ConnectState } from "@/app/actions";

const EMPTY = { label: "", storeName: "", clientId: "", clientSecret: "" };

type Mode = "ikas" | "full";

/**
 * "Mağaza bağla" düğmesi ve bağlantı penceresi.
 * ikas: Client ID / Secret ile test ve kayıt. full: paketin mağaza hakkı doldu.
 * Gizli bilgiler yalnızca form gönderiminde sunucuya gider; sayfada saklanmaz ve geri gönderilmez.
 */
export function ConnectButton({ platform, mode, label = "Mağaza bağla", ghost }: { platform: string; mode: Mode; label?: string; ghost?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Alanlar denetimli: React form gönderiminden sonra alanları temizlediği için test sonrası değerler korunur.
  // Değerler yalnızca bu pencerenin belleğinde durur; kayıttan sonra silinir.
  const [v, setV] = useState(EMPTY);
  const field = (k: keyof typeof EMPTY) => ({ name: k, value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV((x) => ({ ...x, [k]: e.target.value })) });
  const router = useRouter();
  const [tested, test, testing] = useActionState<ConnectState, FormData>(testIkasConnection, null);
  const [saved, save, saving] = useActionState<ConnectState, FormData>(connectIkas, null);
  // Son işlemin sonucu gösterilir (test ya da kayıt).
  const result = (saved?.at ?? 0) >= (tested?.at ?? 0) ? saved ?? tested : tested;

  useEffect(() => {
    if (saved?.done) {
      setV(EMPTY); // eslint-disable-line react-hooks/set-state-in-effect
      ref.current?.close();
      router.push(`/entegrasyonlar?ok=${encodeURIComponent(saved.message ?? "Mağaza bağlandı.")}`);
    }
  }, [saved, router]);

  const busy = testing || saving;
  return (
    <>
      <button type="button" className={ghost ? "btn-ghost w-full" : "btn w-full"} onClick={() => ref.current?.showModal()}>{label}</button>
      <dialog ref={ref} aria-labelledby={`dlg-${platform}`} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-0 text-left shadow-xl backdrop:bg-gray-900/40">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id={`dlg-${platform}`} className="text-lg font-semibold">{mode === "ikas" ? "ikas mağazası bağla" : "Mağaza bağla"}</h2>
          <button type="button" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Kapat" onClick={() => ref.current?.close()}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {mode === "ikas" && (
          <form className="space-y-3 px-5 py-4">
            <label className="block"><span className="label">Panelde görünecek ad</span><input className="input" {...field("label")} placeholder="Örn. Ana Mağaza" required /></label>
            <label className="block">
              <span className="label">ikas mağaza adı</span>
              <span className="flex items-center gap-2"><input className="input" {...field("storeName")} placeholder="magazam" autoCapitalize="none" required /><span className="shrink-0 text-sm text-gray-500">.myikas.com</span></span>
            </label>
            <label className="block"><span className="label">Client ID</span><input className="input font-mono" {...field("clientId")} autoComplete="off" data-1p-ignore data-lpignore="true" required /></label>
            <label className="block"><span className="label">Client Secret</span><input className="input font-mono" {...field("clientSecret")} type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" required /></label>
            <p className="text-xs leading-relaxed text-gray-500">ikas panelinde <b>Uygulamalar → Uygulamalarım → Daha Fazla → Özel Uygulama Oluştur</b> ile bir uygulama açın; ürün, stok ve sipariş izinlerini verin. Müşteri izni gerekmez.</p>
            {result?.message && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{result.message}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>İptal</button>
              <button type="submit" formAction={test} className="btn-ghost" disabled={busy}>{testing ? "Deneniyor…" : "Bağlantıyı test et"}</button>
              <button type="submit" formAction={save} className="btn" disabled={busy}>{saving ? "Bağlanıyor…" : "Mağazayı bağla"}</button>
            </div>
          </form>
        )}

        {mode !== "ikas" && (
          <div className="space-y-3 px-5 py-4 text-sm text-gray-600">
            {mode === "full" && <p>Paketinizin mağaza hakkı doldu. Daha fazla mağaza bağlamak için lütfen paketinizi değiştirin.</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" className="btn-ghost" onClick={() => ref.current?.close()}>İptal</button>
              {mode === "full" && <a href="/lisans" className="btn">Paketi değiştir</a>}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
