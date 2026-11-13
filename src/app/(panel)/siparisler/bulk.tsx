"use client";

import { useEffect, useState } from "react";

const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox][form="bulk"][name="ids"]')];

/** Toplu seçim çubuğu: tümünü seç + seçilenleri sil / geri al. */
export function BulkBar({ trash, total }: { trash: boolean; total: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const onChange = (e: Event) => {
      if ((e.target as HTMLElement)?.matches?.('input[form="bulk"][name="ids"]')) setCount(boxes().filter((b) => b.checked).length);
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  if (!total) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={count > 0 && count === total}
          onChange={(e) => {
            boxes().forEach((b) => (b.checked = e.target.checked));
            setCount(e.target.checked ? boxes().length : 0);
          }}
        />
        Bu sayfadakilerin tümünü seç
      </label>
      <span className="text-gray-500">{count} seçili</span>
      <button
        disabled={!count}
        onClick={(e) => {
          if (!trash && !confirm(`${count} sipariş panelden silinsin mi? ikas'taki siparişler etkilenmez.`)) e.preventDefault();
        }}
        className={`ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${trash ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50" : "bg-red-600 text-white hover:bg-red-700"}`}
      >
        {trash ? "Seçilenleri geri al" : "Seçilenleri sil"}
      </button>
    </div>
  );
}

export function ConfirmButton({ message, children }: { message: string; children: React.ReactNode }) {
  return (
    <button onClick={(e) => { if (!confirm(message)) e.preventDefault(); }} className="btn-ghost text-red-600">
      {children}
    </button>
  );
}
