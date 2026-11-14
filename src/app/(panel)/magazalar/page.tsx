import { redirect } from "next/navigation";

// Mağaza yönetimi Entegrasyonlar sayfasına taşındı; eski bağlantılar ve bildirim mesajları korunur.
export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  redirect(q ? `/entegrasyonlar?${q}` : "/entegrasyonlar");
}
