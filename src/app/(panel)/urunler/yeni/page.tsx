import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { getStores } from "@/lib/cache";
import { db } from "@/lib/db";
import { listNamed } from "@/lib/ikas";
import { requireUser } from "@/lib/session";
import { PageHeader } from "../../ui";
import { ProductForm } from "./form";

export default async function Page() {
  const user = await requireUser();
  if (!hasModule(user, "urun")) return <Locked moduleId="urun" />;
  const stores = await getStores(user.id);
  if (!stores.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">Ürün eklemek için önce mağaza bağlayın.</p>
        <Link href="/entegrasyonlar" className="btn mt-4">Mağaza bağla</Link>
      </div>
    );
  }

  const defs = await db.definition.findMany({ where: { userId: user.id, kind: { in: ["category", "brand"] } } });
  // Öneri listeleri: mağazalardaki mevcut marka/kategori/etiket adları (ulaşılamazsa boş kalır).
  const suggest = async (kind: "brand" | "category" | "tag") => {
    const lists = await Promise.allSettled(stores.map((s) => listNamed(s, kind)));
    const names = lists.flatMap((l) => (l.status === "fulfilled" ? l.value.map((x) => x.name) : []));
    // Panelde tanımlı kategori ve markalar da öneri olarak çıkar.
    if (kind !== "tag") names.push(...defs.filter((d) => d.kind === kind).map((d) => d.name));
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "tr"));
  };
  const [brands, categories, tags] = await Promise.all([suggest("brand"), suggest("category"), suggest("tag")]);

  return (
    <>
      <PageHeader title="Ürün ekle" desc="Ürün, seçtiğiniz mağazalarda aynı SKU ile oluşturulur ve ortak stoğa bağlanır.">
        <Link href="/urunler/tanimlamalar" className="btn-ghost">Tanımlamalar</Link>
      </PageHeader>
      <ProductForm stores={stores.map((s) => ({ id: s.id, label: s.label }))} brands={brands} categories={categories} tags={tags} />
    </>
  );
}
