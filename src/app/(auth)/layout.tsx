import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">Ship<span className="text-indigo-600">To</span>Ecom</Link>
          <p className="mt-1 text-sm text-gray-500">İki ikas mağazası, tek stok.</p>
        </div>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
