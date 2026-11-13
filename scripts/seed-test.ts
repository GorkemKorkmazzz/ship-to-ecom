// Uçtan uca senkron testi için test veritabanını doldurur: bir kullanıcı, bir sahte ikas mağazası
// ("magaza-a", scripts/mock-ikas.mjs) ve bir sahte T-Soft mağazası (scripts/mock-tsoft.mjs).
//   DATABASE_URL=file:./test.db APP_SECRET=<64 hex> node --experimental-strip-types scripts/seed-test.ts
import { PrismaClient } from "@prisma/client";
import { encrypt, randomToken } from "../src/lib/crypto.ts";

if (!/test\.db/.test(process.env.DATABASE_URL ?? "")) throw new Error("Bu betik yalnızca test veritabanında çalışır (DATABASE_URL test.db olmalı).");
const db = new PrismaClient();
await db.user.deleteMany({});
const user = await db.user.create({ data: { email: "test@ornek.test", passwordHash: "-", plan: "kurumsal", trialEndsAt: new Date(Date.now() + 14 * 86400000) } });
await db.store.create({ data: { userId: user.id, platform: "ikas", label: "ikas Test", storeName: "magaza-a", clientId: "id", clientSecretEnc: encrypt("gizli"), webhookSecret: randomToken() } });
await db.store.create({ data: { userId: user.id, platform: "tsoft", label: "T-Soft Test", storeName: "tsoft-magaza.test", externalId: "ts-1", clientId: "", clientSecretEnc: "", webhookSecret: randomToken() } });
console.log("test verisi hazır:", user.email);
await db.$disconnect();
