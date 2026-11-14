import { getStores } from "@/lib/cache";
import { withUser } from "@/lib/mobile";
import { accountStatus, planById, storeLimitOf } from "@/lib/plans";
import { platformName, storeHost } from "@/lib/platforms";

// GET → hesap, paket ve bağlı mağazalar
export const GET = withUser(async (user) => {
  const stores = await getStores(user.id);
  return Response.json({
    email: user.email,
    paket: planById(user.plan)?.name ?? user.plan,
    durum: accountStatus(user, Date.now()),
    magazaHakki: storeLimitOf(user.plan),
    sonSenkron: user.lastSyncAt,
    magazalar: stores.map((s) => ({ id: s.id, ad: s.label, adres: storeHost(s), platform: platformName(s), sonSenkron: s.lastSyncAt, hata: s.lastError })),
  });
});
