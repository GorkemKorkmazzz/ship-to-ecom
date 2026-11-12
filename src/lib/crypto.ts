import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

function key(): Buffer {
  const hex = process.env.APP_SECRET ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("APP_SECRET 64 hex karakter olmalı");
  return Buffer.from(hex, "hex");
}

export function secretKeyBytes(): Uint8Array {
  return new Uint8Array(key());
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
