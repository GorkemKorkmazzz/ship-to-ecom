// Uçtan uca senkron testi için test veritabanını doldurur: bir kullanıcı, bir sahte ikas mağazası
// iki sahte ikas mağazası ("magaza-a" ve "magaza-b", scripts/mock-ikas.mjs).
//   DATABASE_URL=file:./test.db APP_SECRET=<64 hex> node --experimental-strip-types scripts/seed-test.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt, randomToken } from "../src/lib/crypto.ts";

if (!/test\.db/.test(process.env.DATABASE_URL ?? "")) throw new Error("Bu betik yalnızca test veritabanında çalışır (DATABASE_URL test.db olmalı).");
// Yalnızca test veritabanındaki hesap için; gerçek bir hesabın şifresi değildir.
const TEST_EMAIL = "test@ornek.test";
const TEST_PASSWORD = "test-sifre-1234";
const db = new PrismaClient();
await db.user.deleteMany({});
const user = await db.user.create({ data: { email: TEST_EMAIL, passwordHash: await bcrypt.hash(TEST_PASSWORD, 10), plan: "kurumsal", trialEndsAt: new Date(Date.now() + 14 * 86400000) } });
await db.store.create({ data: { userId: user.id, platform: "ikas", label: "ikas Test", storeName: "magaza-a", clientId: "id", clientSecretEnc: encrypt("gizli"), webhookSecret: randomToken() } });
await db.store.create({ data: { userId: user.id, platform: "ikas", label: "ikas B", storeName: "magaza-b", clientId: "id", clientSecretEnc: encrypt("gizli"), webhookSecret: randomToken() } });
console.log("test verisi hazır:", user.email);
await db.$disconnect();
