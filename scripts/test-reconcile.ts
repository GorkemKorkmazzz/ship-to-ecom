import assert from "node:assert/strict";
import { allocate, publish, reconcile } from "../src/lib/reconcile.ts";

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
// Akıllı dağıtım: ayarlar kapalıyken publish ile aynı
const A = (pct: number, min = 0, priority = false) => ({ sharePercent: pct, minStock: min, priority });
for (const [sh, sf, p1, p2] of [[10, 0, 100, 100], [10, 2, 70, 30], [1, 2, 100, 100], [0, 0, 100, 100], [11, 1, 70, 30]])
  assert.deepEqual(allocate(sh, sf, [A(p1), A(p2)], null).targets, [publish(sh, sf, p1), publish(sh, sf, p2)]);
// Minimum stok: payı 10'dan 1 veren mağaza en az 3 alır
assert.deepEqual(allocate(10, 0, [A(90), A(10, 3)], null).targets, [9, 3]);
// Minimum, satılabilir stoğu aşamaz
assert.deepEqual(allocate(2, 0, [A(100), A(0, 5)], null).targets, [2, 2]);
// Kritik mod: satılabilir 3 <= eşik 3, öncelikli B → yalnızca B'de satışta
assert.deepEqual(allocate(5, 2, [A(100), A(100, 0, true)], 3), { critical: true, targets: [0, 3] });
// Eşik üstünde normal
assert.deepEqual(allocate(6, 2, [A(100), A(100, 0, true)], 3), { critical: false, targets: [4, 4] });
// Öncelikli mağaza seçilmemişse kritik mod devreye girmez
assert.deepEqual(allocate(2, 0, [A(100), A(100)], 3), { critical: false, targets: [2, 2] });
// Kritik modda minimum stok uygulanmaz
assert.deepEqual(allocate(2, 0, [A(100, 5, true), A(100, 5)], 2).targets, [2, 0]);
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

import { normalizeDomain } from "../src/lib/website.ts";
assert.equal(normalizeDomain("https://www.Magazam.com/urunler?x=1"), "magazam.com");
assert.equal(normalizeDomain("magazam.com.tr:443"), "magazam.com.tr");
assert.equal(normalizeDomain("shop.magazam.com."), "shop.magazam.com");
assert.equal(normalizeDomain("çiçek.com"), new URL("http://çiçek.com").hostname); // IDN → punycode
for (const bad of ["", "magazam", "http://", "-a.com", "a..com", "1.2.3.4", "javascript:alert(1)"]) assert.equal(normalizeDomain(bad), null, bad);
console.log("alan adı: tüm testler geçti");
