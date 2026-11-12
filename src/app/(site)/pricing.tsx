"use client";

import Link from "next/link";
import { useState } from "react";
import { PLANS, TRIAL_DAYS, tl } from "@/lib/plans";

export function Pricing() {
  const [yearly, setYearly] = useState(true);
  return (
    <>
      <div className="mx-auto mt-8 flex w-fit items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 text-sm font-medium">
        <button type="button" onClick={() => setYearly(false)} aria-pressed={!yearly} className={`cursor-pointer rounded-lg px-4 py-2 ${!yearly ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>Aylık</button>
        <button type="button" onClick={() => setYearly(true)} aria-pressed={yearly} className={`cursor-pointer rounded-lg px-4 py-2 ${yearly ? "bg-indigo-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
          Yıllık <span className={`ml-1 rounded-md px-1.5 py-0.5 text-xs ${yearly ? "bg-white/20" : "bg-emerald-100 text-emerald-700"}`}>%20 indirim</span>
        </button>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`relative flex flex-col rounded-2xl border bg-white p-6 ${p.popular ? "border-indigo-600 shadow-lg ring-4 ring-indigo-100" : "border-gray-200"}`}>
            {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">En çok tercih edilen</span>}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{p.tagline}</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold tracking-tight tabular-nums">{tl(yearly ? p.yearlyMonthly : p.monthly)}</span>
              <span className="text-sm text-gray-500">/ ay</span>
            </div>
            <p className="mt-1 h-5 text-xs text-gray-500">{yearly ? `Yıllık ${tl(p.yearlyMonthly * 12)} olarak faturalanır` : "Aylık faturalanır, istediğiniz zaman iptal"}</p>
            <Link href={`/kayit?paket=${p.id}&donem=${yearly ? "yillik" : "aylik"}`} className={`mt-5 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${p.popular ? "bg-indigo-600 text-white hover:bg-indigo-700" : "border border-gray-300 text-gray-800 hover:bg-gray-50"}`}>
              {TRIAL_DAYS} gün ücretsiz dene
            </Link>
            <ul className="mt-6 space-y-2.5 text-sm text-gray-700">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
