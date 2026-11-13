import Link from "next/link";

export function OrderTabs({ active }: { active: "siparisler" | "sepetler" }) {
  const tab = (on: boolean) => `-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium ${on ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-800"}`;
  return (
    <div className="mb-4 flex gap-6 border-b border-gray-200">
      <Link href="/siparisler" className={tab(active === "siparisler")}>Siparişler</Link>
      <Link href="/siparisler/sepetler" className={tab(active === "sepetler")}>Terk edilmiş sepetler</Link>
    </div>
  );
}
