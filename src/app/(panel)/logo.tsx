export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8h11l-3-3M20 16H9l3 3" />
        </svg>
      </span>
      <span>Ship<span className="text-indigo-600">To</span>Ecom</span>
    </span>
  );
}
