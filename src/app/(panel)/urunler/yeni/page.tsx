import Link from "next/link";
import { db } from "@/lib/db";
import { listNamed } from "@/lib/ikas";
import { requireUser } from "@/lib/session";
import { PageHeader } from "../../ui";
import { ProductForm } from "./form";

export default async function Page() {
  const user = await requireUser();
  const stores = await db.store.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  if (!stores.length) {
    return (
      <div className="card mx-auto max-w-lg text-center">
        <p className="text-sm text-gray-600">Ürün eklemek için önce mağaza bağlayın.</p>
        <Link href="/magazalar" className="btn mt-4">Mağaza bağla</Link>
      </div>
    );
  }

  // Öneri listeleri: mağazalardaki mevcut marka/kategori/etiket adları (ulaşılamazsa boş kalır).
  const suggest = async (kind: "brand" | "category" | "tag") => {
    const lists = await Promise.allSettled(stores.map((s) => listNamed(s, kind)));
    const names = lists.flatMap((l) => (l.status === "fulfilled" ? l.value.map((x) => x.name) : []));
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "tr"));
  };
  const [brands, categories, tags] = await Promise.all([suggest("brand"), suggest("category"), suggest("tag")]);

  return (
    <>
      <PageHeader title="Ürün ekle" desc="Ürün, seçtiğiniz mağazalarda aynı SKU ile oluşturulur ve ortak stoğa bağlanır." />
      <ProductForm stores={stores.map((s) => ({ id: s.id, label: s.label }))} brands={brands} categories={categories} tags={tags} />
    </>
  );
}
