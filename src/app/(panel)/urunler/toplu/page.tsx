import { Locked } from "@/app/(panel)/locked";
import { hasModule } from "@/lib/access";
import Link from "next/link";
import { toCsv } from "@/lib/csv";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader } from "../../ui";
import { bulkCreate, bulkUpdate } from "../actions";

const dataUri = (csv: string) => `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
const UPDATE_TEMPLATE = toCsv(["sku", "stok", "satis_fiyati", "indirimli_fiyat", "alis_fiyati"], [["TS-001", 25, 349.9, "", 120], ["TS-002", "", 399.9, 349.9, ""]]);
const CREATE_TEMPLATE = toCsv(
  ["urun_adi", "sku", "satis_fiyati", "indirimli_fiyat", "alis_fiyati", "stok", "barkod", "marka", "kategori", "etiketler", "aciklama", "gorsel_url"],
  [["Örnek Tişört", "ORN-001", 349.9, 299.9, 120, 20, "8690000000001", "Marka", "Giyim|Tişört", "yeni|pamuk", "Ürün açıklaması", "https://ornek.com/gorsel.jpg"]],
);
const file = "block w-full text-sm text-gray-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium";

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; hata?: string }> }) {
  const user = await requireUser();
  if (!hasModule(user, "urun")) return <Locked moduleId="urun" />;
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Toplu işlemler" desc="CSV dosyasıyla (Excel'de açılır/kaydedilir) toplu güncelleme ve ürün ekleme.">
        <Link href="/urunler" className="btn-ghost">← Ürünler</Link>
      </PageHeader>
      <Flash ok={sp.ok} hata={sp.hata} />
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card space-y-3">
          <h2 className="font-semibold">1. Dışa aktar</h2>
          <p className="text-sm text-gray-600">Tüm ürünleri, ortak stok ve mağaza fiyatlarıyla CSV olarak indirin. İlk altı sütun toplu güncelleme için hazırdır.</p>
          <a href="/urunler/disa-aktar" className="btn-ghost">Ürün listesini indir</a>
        </section>

        <form action={bulkUpdate} className="card space-y-3">
          <h2 className="font-semibold">2. Toplu stok ve fiyat güncelle</h2>
          <p className="text-sm text-gray-600">
            Sütunlar: <code className="text-xs">sku; stok; satis_fiyati; indirimli_fiyat; alis_fiyati</code>. Boş hücre değiştirilmez; indirimli fiyatı kaldırmak için <code className="text-xs">-</code> yazın.
          </p>
          <input className={file} type="file" name="file" accept=".csv,text/csv" required />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn">Yükle ve uygula</button>
            <a className="text-sm text-indigo-700 hover:underline" href={dataUri(UPDATE_TEMPLATE)} download="toplu-guncelleme-sablonu.csv">Şablonu indir</a>
          </div>
          <p className="text-xs text-gray-500">Stok ortak stoğa, fiyat ise otomatik fiyat kuralı olmayan mağazalara yazılır. En fazla 500 satır.</p>
        </form>

        <form action={bulkCreate} className="card space-y-3">
          <h2 className="font-semibold">3. Toplu ürün ekle</h2>
          <p className="text-sm text-gray-600">Her satır, bağlı tüm mağazalarda varyantsız bir ürün oluşturur. Birden fazla kategori/etiket için <code className="text-xs">|</code> kullanın.</p>
          <input className={file} type="file" name="file" accept=".csv,text/csv" required />
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn">Yükle ve oluştur</button>
            <a className="text-sm text-indigo-700 hover:underline" href={dataUri(CREATE_TEMPLATE)} download="toplu-urun-sablonu.csv">Şablonu indir</a>
          </div>
          <p className="text-xs text-gray-500">En fazla 100 satır. Varyantlı ürünler için Ürün ekle ekranını kullanın.</p>
        </form>
      </div>
    </>
  );
}
