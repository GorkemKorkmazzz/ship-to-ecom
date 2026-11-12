import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { priceOf } from "@/lib/plans";
import { requireUser } from "@/lib/session";
import { Flash, PageHeader } from "../../ui";
import { createOrder } from "../actions";
import { OrderSummary } from "../summary";

export default async function Page({ searchParams }: { searchParams: Promise<{ paket?: string; donem?: string; hata?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const price = priceOf(sp.paket ?? "", sp.donem ?? "");
  if (!price) redirect("/lisans");
  const b = await db.billingInfo.findUnique({ where: { userId: user.id } });

  return (
    <>
      <PageHeader title="Fatura bilgileri" desc="Adım 1 / 2 — faturanız bu bilgilerle düzenlenir.">
        <Link href="/lisans" className="btn-ghost">← Paketler</Link>
      </PageHeader>
      <Flash hata={sp.hata} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form action={createOrder} className="card space-y-4 lg:col-span-2">
          <input type="hidden" name="paket" value={price.plan.id} />
          <input type="hidden" name="donem" value={price.period} />
          <fieldset className="flex gap-5 text-sm">
            <legend className="label">Fatura türü</legend>
            <label className="flex items-center gap-2"><input type="radio" name="type" value="kurumsal" defaultChecked={b?.type !== "bireysel"} /> Kurumsal</label>
            <label className="flex items-center gap-2"><input type="radio" name="type" value="bireysel" defaultChecked={b?.type === "bireysel"} /> Bireysel</label>
          </fieldset>
          <label className="block">
            <span className="label">Ad soyad / Şirket unvanı *</span>
            <input className="input" name="name" defaultValue={b?.name} autoComplete="organization" required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Vergi no (10 hane) / T.C. kimlik no (11 hane) *</span>
              <input className="input" name="taxNumber" inputMode="numeric" defaultValue={b?.taxNumber} required />
            </label>
            <label className="block">
              <span className="label">Vergi dairesi</span>
              <input className="input" name="taxOffice" defaultValue={b?.taxOffice} placeholder="Kurumsal için zorunlu" />
            </label>
          </div>
          <label className="block">
            <span className="label">Adres *</span>
            <textarea className="input" name="address" rows={2} defaultValue={b?.address} autoComplete="street-address" required />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="label">İlçe *</span><input className="input" name="district" defaultValue={b?.district} required /></label>
            <label className="block"><span className="label">İl *</span><input className="input" name="city" defaultValue={b?.city} autoComplete="address-level1" required /></label>
            <label className="block"><span className="label">Telefon *</span><input className="input" name="phone" type="tel" defaultValue={b?.phone} autoComplete="tel" required /></label>
            <label className="block"><span className="label">Fatura e-postası *</span><input className="input" name="email" type="email" defaultValue={b?.email ?? user.email} autoComplete="email" required /></label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="sozlesme" className="mt-1" required />
            <span>Satış koşullarını ve lisansın seçtiğim dönem için geçerli olduğunu kabul ediyorum.</span>
          </label>
          <button className="btn">Ödemeye geç →</button>
        </form>
        <OrderSummary plan={price.plan.id} period={price.period} amount={price.amount} vat={price.vat} total={price.total} />
      </div>
    </>
  );
}
