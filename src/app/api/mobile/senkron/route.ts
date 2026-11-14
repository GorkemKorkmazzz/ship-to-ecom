import { db } from "@/lib/db";
import { apiError, withUser } from "@/lib/mobile";
import { syncUser } from "@/lib/sync";

export const maxDuration = 300;

// POST → mağazaları şimdi senkronize eder (paneldeki "Şimdi senkronize et" ile aynı işlem)
export const POST = withUser(async (user) => {
  try {
    await syncUser(user.id);
  } catch (e) {
    return apiError(502, e instanceof Error ? e.message : "Senkron başarısız.");
  }
  const [me, stores] = await Promise.all([db.user.findUnique({ where: { id: user.id } }), db.store.findMany({ where: { userId: user.id } })]);
  const errors = stores.filter((s) => s.lastError).map((s) => `${s.label}: ${s.lastError}`);
  return Response.json({ tamam: !errors.length, sonSenkron: me?.lastSyncAt ?? null, hatalar: errors });
});
