import assert from "node:assert/strict";
import { publish, reconcile } from "../src/lib/reconcile.ts";

// İlk eşleşme: düşük olan
assert.equal(reconcile(null, [{ current: 10, lastSeen: null }, { current: 12, lastSeen: null }]), 10);
// Değişiklik yok
assert.equal(reconcile(10, [{ current: 10, lastSeen: 10 }, { current: 10, lastSeen: 10 }]), 10);
// A'da 2 adet satıldı
assert.equal(reconcile(10, [{ current: 8, lastSeen: 10 }, { current: 10, lastSeen: 10 }]), 8);
// Aynı anda A'da 2, B'de 3 satıldı
assert.equal(reconcile(10, [{ current: 8, lastSeen: 10 }, { current: 7, lastSeen: 10 }]), 5);
// B'den elle 20 adet stok girişi + A'da 1 satış
assert.equal(reconcile(10, [{ current: 9, lastSeen: 10 }, { current: 30, lastSeen: 10 }]), 29);
// Fazla satış eksiye düşmez
assert.equal(reconcile(1, [{ current: 0, lastSeen: 1 }, { current: 0, lastSeen: 1 }]), 0);
// Önceki turda B'ye yazılamadı (B hâlâ 10, lastSeen 10), ortak 8: fark yok, 8 kalır
assert.equal(reconcile(8, [{ current: 8, lastSeen: 8 }, { current: 10, lastSeen: 10 }]), 8);
// Panel düzeltmesi (+5) ve aynı anda A'da 1 satış
assert.equal(reconcile(10, [{ current: 9, lastSeen: 10 }, { current: 10, lastSeen: 10 }], 5), 14);
// Güvenlik stoğu ve mağaza payı
assert.equal(publish(10, 0, 100), 10);
assert.equal(publish(10, 2, 100), 8);
assert.equal(publish(1, 2, 100), 0);
assert.equal(publish(10, 0, 70), 7);
assert.equal(publish(10, 0, 30), 3);
assert.equal(publish(11, 1, 70) + publish(11, 1, 30), 10);
// Güvenlik stoğuyla: ortak 10, mağazalarda 8 yayınlanmış; A'da 3 satılırsa ortak 7 olur
assert.equal(reconcile(10, [{ current: 5, lastSeen: 8 }, { current: 8, lastSeen: 8 }]), 7);
console.log("reconcile: tüm testler geçti");

import { applyRule } from "../src/lib/pricing.ts";
assert.equal(applyRule(100, { percent: 10, fixed: 0, round: "none" }), 110);
assert.equal(applyRule(100, { percent: -15, fixed: 5, round: "none" }), 90);
assert.equal(applyRule(349.9, { percent: 10, fixed: 0, round: "none" }), 384.89);
assert.equal(applyRule(349.9, { percent: 10, fixed: 0, round: "1" }), 385);
assert.equal(applyRule(349.9, { percent: 10, fixed: 0, round: "0.90" }), 384.9);
assert.equal(applyRule(100, { percent: 12, fixed: 0, round: "0.99" }), 111.99);
assert.equal(applyRule(10, { percent: -200, fixed: 0, round: "none" }), 0);
console.log("fiyat kuralı: tüm testler geçti");
