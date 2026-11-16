// Akıllı reklam analizi: kural motoru ve yapay zekâ açıklama servisi testleri (ağ ve veritabanı yok).
//   node --experimental-strip-types scripts/test-insights.ts
import assert from "node:assert/strict";
import { MIN_CONV, compare, ratios, runEngine, zCount, zProp, type EngineInput, type Metrics } from "../src/lib/ads/insight-engine.ts";
import { narrate, unsupportedNumbers, type Narrator } from "../src/lib/ai/narrator.ts";

const m = (spend: number, impressions: number, clicks: number, conversions: number, value: number): Metrics => ({ spend, impressions, clicks, conversions, value });
const base = (over: Partial<EngineInput> = {}): EngineInput => ({ platform: "google", currency: "TRY", days: 30, total: m(1000, 100000, 1000, 20, 4000), prevTotal: m(1000, 100000, 1000, 20, 4000), campaigns: [], creatives: [], products: [], productRoasBasis: "x:", ...over });

// Oranlar: ROAS = değer / harcama, CPA = harcama / dönüşüm, CTR = tıklama / gösterim.
const r = ratios(m(500, 10000, 200, 10, 2000));
assert.equal(r.roas, 4); assert.equal(r.cpa, 50); assert.equal(r.ctr, 0.02); assert.equal(r.cpc, 2.5); assert.equal(r.cvr, 0.05);
assert.equal(ratios(m(0, 0, 0, 0, 0)).roas, null, "harcama yoksa ROAS hesaplanamaz (0 değil)");

// İstatistik: aynı oran → z = 0; büyük örneklemde belirgin düşüş anlamlı; küçük örneklemde değil.
assert.equal(zProp(100, 10000, 100, 10000), 0);
assert.ok(zProp(300, 10000, 200, 10000)! < -1.96);
assert.ok(Math.abs(zProp(3, 100, 2, 100)!) < 1.96);
assert.ok(zCount(40, 20)! < -1.96); assert.ok(Math.abs(zCount(6, 4)!) < 1.96);

// Dönem karşılaştırması: önceki dönem yoksa değişim null, yeterlilik false.
const noPrev = compare(m(100, 1000, 10, 1, 300), null);
assert.ok(noPrev.every((c) => c.rel === null || c.metric === "spend"));
assert.ok(noPrev.filter((c) => c.metric !== "spend").every((c) => !c.enough && !c.significant));
// Yetersiz dönüşüm (< MIN_CONV): ROAS %50 düşse bile anlamlı sayılmaz.
const thin = compare(m(100, 5000, 100, MIN_CONV - 1, 100), m(100, 5000, 100, MIN_CONV - 1, 200)).find((c) => c.metric === "roas")!;
assert.equal(thin.enough, false); assert.equal(thin.significant, false);
// Yeterli veri + %25 düşüş → anlamlı; ROAS 4 → 3.
const roas = compare(m(1000, 50000, 500, 15, 3000), m(1000, 50000, 500, 20, 4000)).find((c) => c.metric === "roas")!;
assert.equal(roas.from, 4); assert.equal(roas.to, 3); assert.equal(roas.significant, true); assert.equal(Math.round(roas.rel! * 100), -25);
// %10'luk değişim eşiğin altında.
assert.equal(compare(m(1000, 50000, 500, 18, 3600), m(1000, 50000, 500, 20, 4000)).find((c) => c.metric === "roas")!.significant, false);

// Motor: sabit performansta uyarı yok.
assert.equal(runEngine(base()).insights.length, 0);
// Hesap ROAS düşüşü (%50) → kritik uyarı, dayanak metrikleriyle.
const drop = runEngine(base({ total: m(1000, 100000, 1000, 20, 2000) }));
const roasAlert = drop.insights.find((x) => x.title === "ROAS düşüşü")!;
assert.equal(roasAlert.priority, "kritik"); assert.ok(roasAlert.basis.includes("ROAS")); assert.ok(roasAlert.metrics.length > 0);
// Dönüşümsüz harcama: harcama ≥ 3 × ortalama CPA ve 0 dönüşüm → kritik; eşiğin altında üretilmez.
const avgCpa = 1000 / 20;
const camp = (spend: number) => runEngine(base({ campaigns: [{ id: "c1", name: "K1", cur: m(spend, 5000, 50, 0, 0), prev: null }] })).insights.filter((x) => x.title === "Harcama var, dönüşüm yok");
assert.equal(camp(avgCpa * 3).length, 1); assert.equal(camp(avgCpa * 2.9).length, 0);
// Yüksek ROAS fırsatı yalnızca yeterli dönüşümle.
const opp = (conv: number) => runEngine(base({ campaigns: [{ id: "c2", name: "K2", cur: m(100, 5000, 100, conv, 100 * 4 * 2), prev: null }] })).insights.some((x) => x.title === "Bütçe artırımı değerlendirilebilir");
assert.equal(opp(MIN_CONV), true); assert.equal(opp(MIN_CONV - 1), false);
// Yetersiz veriyle kampanya kararı verilmez.
assert.equal(runEngine(base({ campaigns: [{ id: "c3", name: "K3", cur: m(10, 500, 5, 0, 0), prev: m(10, 500, 5, 0, 0) }] })).campaignAnalyses[0].verdict, "yetersiz");
// Platform ayrımı: Meta metni Meta atıfını, Google metni Google dönüşüm tanımını kullanır; diğer platform adı geçmez.
const meta = runEngine(base({ platform: "meta" })).summary.join(" "), google = runEngine(base()).summary.join(" ");
assert.ok(meta.includes("Meta") && !meta.includes("Google")); assert.ok(google.includes("Google") && !google.includes("Meta"));
// Önceki dönem yoksa özet bunu söyler, değişim uydurmaz.
assert.ok(runEngine(base({ prevTotal: null })).summary[0].includes("hesaplanamaz"));
// Belirleyicilik: aynı girdi, aynı çıktı.
assert.deepEqual(runEngine(base({ total: m(1000, 100000, 1000, 20, 2000) })), runEngine(base({ total: m(1000, 100000, 1000, 20, 2000) })));
console.log("akıllı analiz motoru: tüm testler geçti");

// Yapay zekâ servisi: yapılandırma yok → kural tabanlı; hata → yakalanır; olgularda olmayan sayı → reddedilir.
const facts = "ROAS 3,93 → 2,95 (−%25). Harcama ₺5.884,94.";
assert.deepEqual(unsupportedNumbers("ROAS 2,95'e düştü, %25 azaldı.", facts), []);
assert.deepEqual(unsupportedNumbers("ROAS %40 düştü.", facts), ["40"]);
const fake = (out: string | Error): Narrator => ({ provider: "test", model: "test", narrate: async () => { if (out instanceof Error) throw out; return out; } });
const disabled = await narrate(facts, null);
assert.equal(disabled.ok, false); assert.equal(!disabled.ok && disabled.reason, "disabled");
const err = await narrate(facts, fake(new Error("429 rate limit")));
assert.equal(!err.ok && err.reason, "error");
const rejected = await narrate(facts, fake("ROAS %40 düştü."));
assert.equal(!rejected.ok && rejected.reason, "rejected");
const ok = await narrate(facts, fake("ROAS 3,93'ten 2,95'e geriledi (−%25)."));
assert.equal(ok.ok, true);
delete process.env.AI_PROVIDER;
assert.equal((await narrate(facts)).ok, false, "ortam yapılandırması yoksa servis kapalı");
console.log("yapay zekâ açıklama servisi: tüm testler geçti");
