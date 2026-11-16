// Kural tabanlı reklam analiz motoru. Saf işlev: veritabanına ya da ağa erişmez; aynı girdi her zaman aynı çıktıyı verir (test edilebilir).
// İlkeler:
//  - Tek platformun verisiyle çalışır (Meta ve Google ayrı analiz edilir; dönüşümleri birbirine karışmaz).
//  - Önceki dönem aynı uzunluktadır (çağıran prevRangeOf ile verir). Önceki dönem verisi yoksa değişim "hesaplanamaz" (null), 0 değildir.
//  - Yetersiz örneklemde uyarı/öneri üretilmez. Eşikler istatistikseldir:
//      oranlar (CTR, dönüşüm oranı): iki oran z-testi, |z| ≥ 1,96 (%95 güven) ve en az %20 göreli değişim;
//      sayılar (dönüşüm): Poisson farkı z = (b − a) / √(a + b), |z| ≥ 1,96;
//      ROAS / CPA / CPC: her iki dönemde en az MIN_CONV dönüşüm (ya da MIN_CLICKS tıklama) ve en az %20 göreli değişim.
//  - Neden-sonuç iddia edilmez: ROAS = dönüşüm oranı × ortalama dönüşüm değeri ÷ CPC ayrıştırmasıyla hangi bileşenin değiştiği raporlanır.

export const MIN_CONV = 5; // ROAS/CPA karşılaştırması için her dönemde gereken asgari dönüşüm
export const MIN_CLICKS = 100; // CPC karşılaştırması için
export const MIN_IMPRESSIONS = 1000; // CTR değerlendirmesi için
export const REL = 0.2; // anlamlı sayılan asgari göreli değişim
const Z = 1.96;

export type Metrics = { spend: number; impressions: number; clicks: number; conversions: number; value: number };
export type Priority = "kritik" | "onemli" | "firsat" | "bilgi";
export type Insight = {
  id: string; priority: Priority; kind: "dusus" | "firsat" | "risk" | "bilgi"; title: string;
  entity: { type: "hesap" | "kampanya" | "kreatif" | "urun"; id: string | null; name: string };
  finding: string; metrics: { label: string; value: string }[]; action: string; basis: string[];
};
export type EntityInput = { id: string; name: string; cur: Metrics; prev: Metrics | null; weekly?: Metrics[] };
export type ProductInput = { key: string; name: string; spend: number | null; revenue: number; orders: number; roas: number | null; status: string; eligible: boolean };
export type EngineInput = {
  platform: "meta" | "google"; currency: string; days: number;
  total: Metrics; prevTotal: Metrics | null;
  campaigns: EntityInput[]; creatives: EntityInput[]; products: ProductInput[];
  productRoasBasis: string; // ürün ROAS'ının kaynağı (Meta: ikas UTM cirosu / ürün harcaması)
};

export const ratios = (m: Metrics) => ({
  ctr: m.impressions ? m.clicks / m.impressions : null, cpc: m.clicks ? m.spend / m.clicks : null, cvr: m.clicks ? m.conversions / m.clicks : null,
  cpa: m.conversions ? m.spend / m.conversions : null, roas: m.spend ? m.value / m.spend : null, aov: m.conversions ? m.value / m.conversions : null,
});
export const rel = (now: number | null, before: number | null) => (now === null || before === null || before === 0 ? null : (now - before) / before);
/** İki oran z-testi (x1/n1 ile x2/n2). */
export function zProp(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se ? (x2 / n2 - x1 / n1) / se : null;
}
/** Poisson sayım farkı (önceki a, şimdiki b). */
export const zCount = (a: number, b: number) => (a + b ? (b - a) / Math.sqrt(a + b) : null);

export type Change = { metric: "spend" | "value" | "conversions" | "roas" | "ctr" | "cpc" | "cpa" | "cvr" | "aov"; label: string; from: number | null; to: number | null; rel: number | null; significant: boolean; enough: boolean };
/** Bir varlığın (hesap/kampanya/kreatif) dönem karşılaştırması; her metrik için yeterlilik ve anlamlılık. */
export function compare(cur: Metrics, prev: Metrics | null): Change[] {
  const a = prev ? ratios(prev) : null, b = ratios(cur);
  const convEnough = !!prev && prev.conversions >= MIN_CONV && cur.conversions >= MIN_CONV;
  const clickEnough = !!prev && prev.clicks >= MIN_CLICKS && cur.clicks >= MIN_CLICKS;
  const imprEnough = !!prev && prev.impressions >= MIN_IMPRESSIONS && cur.impressions >= MIN_IMPRESSIONS;
  const big = (r: number | null) => r !== null && Math.abs(r) >= REL;
  const zc = prev ? zProp(prev.clicks, prev.impressions, cur.clicks, cur.impressions) : null;
  const zv = prev ? zProp(prev.conversions, prev.clicks, cur.conversions, cur.clicks) : null;
  const zn = prev ? zCount(prev.conversions, cur.conversions) : null;
  const ch = (metric: Change["metric"], label: string, from: number | null, to: number | null, enough: boolean, sig: boolean): Change => {
    const r = rel(to, from);
    return { metric, label, from, to, rel: r, enough, significant: enough && big(r) && sig };
  };
  return [
    ch("spend", "Harcama", prev?.spend ?? null, cur.spend, !!prev, true),
    ch("value", "Dönüşüm değeri", prev?.value ?? null, cur.value, convEnough, true),
    ch("conversions", "Dönüşüm", prev?.conversions ?? null, cur.conversions, !!prev && prev.conversions + cur.conversions >= MIN_CONV, zn !== null && Math.abs(zn) >= Z),
    ch("roas", "ROAS", a?.roas ?? null, b.roas, convEnough, true),
    ch("cpa", "CPA", a?.cpa ?? null, b.cpa, convEnough, true),
    ch("ctr", "CTR", a?.ctr ?? null, b.ctr, imprEnough, zc !== null && Math.abs(zc) >= Z),
    ch("cpc", "CPC", a?.cpc ?? null, b.cpc, clickEnough, true),
    ch("cvr", "Dönüşüm oranı", a?.cvr ?? null, b.cvr, clickEnough && !!prev && prev.conversions + cur.conversions >= MIN_CONV, zv !== null && Math.abs(zv) >= Z),
    ch("aov", "Ortalama dönüşüm değeri", a?.aov ?? null, b.aov, convEnough, true),
  ];
}

const fmt = (cur: string) => ({
  money: (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(v)),
  n: (v: number | null, d = 0) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v)),
  pct: (v: number | null, d = 1) => (v === null ? "—" : `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: d }).format(v * 100)}`),
  x: (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v)),
});
const signed = (r: number | null, pct: (v: number | null) => string) => (r === null ? "hesaplanamaz" : `${r >= 0 ? "+" : "−"}${pct(Math.abs(r))}`);

/** ROAS değişiminin bileşenleri: hangi bileşen anlamlı değişti (neden-sonuç değil, gözlem). */
function drivers(changes: Change[]) {
  const by = (m: Change["metric"]) => changes.find((c) => c.metric === m)!;
  const out: string[] = [];
  const cvr = by("cvr"), cpc = by("cpc"), aov = by("aov"), ctr = by("ctr");
  if (cvr.significant) out.push(`dönüşüm oranı ${cvr.rel! > 0 ? "yükseldi" : "düştü"}`);
  if (cpc.significant) out.push(`tıklama maliyeti (CPC) ${cpc.rel! > 0 ? "arttı" : "azaldı"}`);
  if (aov.significant) out.push(`dönüşüm başına değer ${aov.rel! > 0 ? "arttı" : "azaldı"}`);
  if (ctr.significant) out.push(`tıklama oranı (CTR) ${ctr.rel! > 0 ? "yükseldi" : "düştü"}`);
  return out;
}

export function runEngine(inp: EngineInput) {
  const F = fmt(inp.currency);
  const P = inp.platform === "meta" ? "Meta Ads" : "Google Ads";
  const convWord = inp.platform === "meta" ? "satın alma (Meta atıfı)" : "dönüşüm (Google Ads, hesaptaki tüm dönüşüm işlemleri)";
  const base = ratios(inp.total);
  const insights: Insight[] = [];
  const add = (x: Omit<Insight, "id">) => insights.push({ ...x, id: `${x.entity.type}:${x.entity.id ?? "-"}:${x.title}` });
  const totalChanges = compare(inp.total, inp.prevTotal);
  const tc = (m: Change["metric"]) => totalChanges.find((c) => c.metric === m)!;

  // ── Hesap düzeyi değişimler ────────────────────────────────────────────
  const acct = { type: "hesap" as const, id: null, name: `${P} (seçili kapsam)` };
  const rule = (m: Change["metric"], bad: "up" | "down", title: string, action: string, prio: (r: number) => Priority) => {
    const c = tc(m);
    if (!c.significant || (bad === "up" ? c.rel! <= 0 : c.rel! >= 0)) return;
    const dr = drivers(totalChanges).filter((d) => !d.startsWith(c.label.toLowerCase()));
    add({ priority: prio(Math.abs(c.rel!)), kind: "dusus", title, entity: acct,
      finding: `${c.label} önceki eş uzunluktaki döneme göre ${signed(c.rel, F.pct)} değişti (${c.metric === "roas" || c.metric === "cpa" || c.metric === "cpc" ? (c.metric === "roas" ? F.x(c.from) : F.money(c.from)) : c.metric === "ctr" || c.metric === "cvr" ? F.pct(c.from, 2) : F.n(c.from, 1)} → ${c.metric === "roas" ? F.x(c.to) : c.metric === "cpa" || c.metric === "cpc" ? F.money(c.to) : c.metric === "ctr" || c.metric === "cvr" ? F.pct(c.to, 2) : F.n(c.to, 1)}).${dr.length ? ` Aynı dönemde ${dr.join(", ")}.` : ""}`,
      metrics: [{ label: c.label, value: signed(c.rel, F.pct) }, { label: "Harcama değişimi", value: signed(tc("spend").rel, F.pct) }],
      action, basis: [c.label, "önceki eş dönem", m === "ctr" || m === "conversions" ? "%95 güven testi" : `her iki dönemde ≥${m === "cpc" ? `${MIN_CLICKS} tıklama` : `${MIN_CONV} dönüşüm`}`] });
  };
  rule("roas", "down", "ROAS düşüşü", "Düşüşün yoğunlaştığı kampanyaları aşağıdaki kampanya analizinden inceleyin; bütçe değişikliğinden önce dönüşüm oranı ve CPC bileşenlerine bakın.", (r) => (r >= 0.4 ? "kritik" : "onemli"));
  rule("ctr", "down", "CTR düşüşü", "Kreatiflerin ve hedef kitlenin güncelliğini inceleyin; CTR'si düşen kreatifler Kreatif Analizi'nde listelenir.", () => "onemli");
  rule("cpc", "up", "CPC artışı", "Teklif stratejisini ve rekabet yoğunluğunu inceleyin; CTR düşüşü eşlik ediyorsa önce kreatifleri değerlendirin.", (r) => (r >= 0.5 ? "kritik" : "onemli"));
  rule("cpa", "up", "CPA artışı", "Dönüşüm oranı düşen kampanyalarda açılış sayfası ve hedeflemeyi inceleyin.", (r) => (r >= 0.5 ? "kritik" : "onemli"));
  rule("conversions", "down", "Dönüşüm sayısında azalma", "Harcama ve trafik değişimiyle birlikte değerlendirin; trafik sabitken dönüşüm düşüyorsa ödeme adımını ve ölçümü (piksel/etiket) kontrol edin.", (r) => (r >= 0.4 ? "kritik" : "onemli"));

  // ── Kampanyalar ────────────────────────────────────────────────────────
  const totalSpend = inp.total.spend || 0, totalConv = inp.total.conversions || 0;
  const campaignAnalyses = inp.campaigns.map((c) => {
    const r = ratios(c.cur), changes = compare(c.cur, c.prev);
    const ent = { type: "kampanya" as const, id: c.id, name: c.name };
    const roasCh = changes.find((x) => x.metric === "roas")!, cpaCh = changes.find((x) => x.metric === "cpa")!, convCh = changes.find((x) => x.metric === "conversions")!;
    const sig = changes.filter((x) => x.significant && x.metric !== "spend");
    const enoughNow = base.cvr ? c.cur.clicks * base.cvr >= MIN_CONV : c.cur.conversions >= MIN_CONV;
    let verdict: "iyi" | "kotu" | "sabit" | "yetersiz" = !enoughNow && c.cur.conversions < MIN_CONV ? "yetersiz" : "sabit";
    const dr = drivers(changes);
    const lines: string[] = [`${inp.days} günde ${F.money(c.cur.spend)} harcama, ${F.n(c.cur.conversions, 1)} ${convWord}, ROAS ${F.x(r.roas)}.`];
    if (c.prev) lines.push(...sig.map((x) => `${x.label} önceki eş döneme göre ${signed(x.rel, F.pct)}.`));
    else lines.push("Önceki dönemde bu kampanyanın verisi yok; karşılaştırma yapılamaz.");
    if (roasCh.significant) verdict = roasCh.rel! > 0 ? "iyi" : "kotu";
    else if (cpaCh.significant) verdict = cpaCh.rel! < 0 ? "iyi" : "kotu";
    else if (convCh.significant) verdict = convCh.rel! > 0 ? "iyi" : "kotu";
    if (dr.length && (verdict === "iyi" || verdict === "kotu")) lines.push(`Gözlenen bileşen değişimleri: ${dr.join(", ")}. Bu bir neden-sonuç tespiti değildir.`);
    if (verdict === "yetersiz") lines.push(`Kesin değerlendirme için yeterli veri yok (en az ${MIN_CONV} dönüşüm ya da ortalama dönüşüm oranıyla ${MIN_CONV} dönüşüm beklenen tıklama gerekir).`);
    const actions: string[] = [];
    if (verdict === "kotu") {
      if (dr.some((d) => d.startsWith("dönüşüm oranı"))) actions.push("Açılış sayfası, ürün uygunluğu ve hedef kitle eşleşmesini inceleyin.");
      if (dr.some((d) => d.startsWith("tıklama maliyeti"))) actions.push("Teklif stratejisini ve rekabet koşullarını inceleyin.");
      if (dr.some((d) => d.startsWith("tıklama oranı"))) actions.push("Düşük CTR'li kreatifleri yenilemeyi değerlendirin.");
      if (!actions.length) actions.push("Kreatif ve hedef kitle performansını kampanya detayında inceleyin.");
    }
    if (verdict === "iyi") actions.push("Performansı koruyan unsurları (kreatif, hedef kitle) not edin; bütçe artırımını kontrollü ve kademeli değerlendirin.");

    // Risk: dönüşümsüz harcama (beklenen ≥3 dönüşüm kadar harcama yapılmış, 0 dönüşüm).
    if (base.cpa && c.cur.conversions === 0 && c.cur.spend >= 3 * base.cpa)
      add({ priority: "kritik", kind: "risk", title: "Harcama var, dönüşüm yok", entity: ent,
        finding: `${F.money(c.cur.spend)} harcandı (platform ortalama CPA'sının ${F.x(c.cur.spend / base.cpa)} katı), ${convWord} 0.`,
        metrics: [{ label: "Harcama", value: F.money(c.cur.spend) }, { label: "Ortalama CPA", value: F.money(base.cpa) }, { label: "Tıklama", value: F.n(c.cur.clicks) }],
        action: "Hedefleme, açılış sayfası ve dönüşüm ölçümünü inceleyin; sorun bulunamazsa bütçeyi gözden geçirmeyi değerlendirin.", basis: ["harcama ≥ 3 × ortalama CPA", "dönüşüm = 0"] });
    // Risk: çok yüksek CPC (platform ortalamasının 2 katı, yeterli tıklamayla).
    if (base.cpc && r.cpc && c.cur.clicks >= MIN_CLICKS && r.cpc >= 2 * base.cpc)
      add({ priority: "onemli", kind: "risk", title: "Çok yüksek CPC", entity: ent, finding: `CPC ${F.money(r.cpc)}, platform ortalaması ${F.money(base.cpc)} (${F.x(r.cpc / base.cpc)} kat).`,
        metrics: [{ label: "CPC", value: F.money(r.cpc) }, { label: "Ortalama CPC", value: F.money(base.cpc) }, { label: "Tıklama", value: F.n(c.cur.clicks) }],
        action: "Teklif ve hedeflemeyi inceleyin; yüksek CPC dönüşüm değeriyle karşılanıyorsa (ROAS) sorun olmayabilir.", basis: [`≥${MIN_CLICKS} tıklama`, "CPC ≥ 2 × platform ortalaması"] });
    // Risk: çok düşük CTR (platform ortalamasından anlamlı ve yarısından az).
    if (base.ctr && r.ctr !== null && c.cur.impressions >= MIN_IMPRESSIONS && r.ctr <= base.ctr * 0.5) {
      const z = zProp(inp.total.clicks, inp.total.impressions, c.cur.clicks, c.cur.impressions);
      if (z !== null && z <= -Z)
        add({ priority: "onemli", kind: "risk", title: "Çok düşük CTR", entity: ent, finding: `CTR ${F.pct(r.ctr, 2)}, platform ortalaması ${F.pct(base.ctr, 2)}.`,
          metrics: [{ label: "CTR", value: F.pct(r.ctr, 2) }, { label: "Gösterim", value: F.n(c.cur.impressions) }],
          action: "Kreatif mesajını ve hedef kitle uyumunu inceleyin. Kampanya amacı bilinirlikse düşük CTR beklenebilir.", basis: [`≥${MIN_IMPRESSIONS} gösterim`, "CTR ≤ ortalamanın yarısı", "%95 güven testi"] });
    }
    // Risk: verimsiz bütçe (harcama payı, dönüşüm payının 2 katından fazla).
    const spendShare = totalSpend ? c.cur.spend / totalSpend : 0, convShare = totalConv ? c.cur.conversions / totalConv : 0;
    if (totalConv >= MIN_CONV * 2 && spendShare >= 0.1 && c.cur.conversions > 0 && spendShare >= 2 * convShare)
      add({ priority: "onemli", kind: "risk", title: "Bütçe verimsiz kullanılıyor", entity: ent, finding: `Harcamanın ${F.pct(spendShare)} kadarını alıyor, dönüşümlerin ${F.pct(convShare)} kadarını getiriyor.`,
        metrics: [{ label: "Harcama payı", value: F.pct(spendShare) }, { label: "Dönüşüm payı", value: F.pct(convShare) }, { label: "ROAS", value: F.x(r.roas) }],
        action: "Bütçe dağılımını gözden geçirmeyi değerlendirin; kampanya amacı dönüşüm değilse bu karşılaştırma uygun olmayabilir.", basis: ["harcama payı ≥ %10", "harcama payı ≥ 2 × dönüşüm payı"] });
    // Fırsat: yüksek ROAS (yeterli dönüşümle, ortalamanın %30 üstü).
    if (base.roas && r.roas !== null && c.cur.conversions >= MIN_CONV && r.roas >= base.roas * 1.3)
      add({ priority: "firsat", kind: "firsat", title: "Bütçe artırımı değerlendirilebilir", entity: ent, finding: `ROAS ${F.x(r.roas)}, platform ortalaması ${F.x(base.roas)}; ${F.n(c.cur.conversions, 1)} dönüşümle yeterli veri var.`,
        metrics: [{ label: "ROAS", value: F.x(r.roas) }, { label: "Dönüşüm", value: F.n(c.cur.conversions, 1) }, { label: "Harcama", value: F.money(c.cur.spend) }],
        action: "Bütçeyi kontrollü (ör. kademeli) artırmayı değerlendirin ve artış sonrası ROAS'ı izleyin. Uygulama sizin onayınızla, reklam platformunda yapılır.", basis: [`≥${MIN_CONV} dönüşüm`, "ROAS ≥ 1,3 × platform ortalaması"] });
    // Risk: uzun süredir düşen (son 3 haftalık dönemin her birinde ROAS bir öncekinden düşük, her hafta yeterli dönüşümle).
    const w = c.weekly ?? [];
    if (w.length >= 3) {
      const last = w.slice(-3), rs = last.map((x) => ratios(x).roas);
      if (last.every((x) => x.conversions >= MIN_CONV) && rs.every((x) => x !== null) && rs[0]! > rs[1]! && rs[1]! > rs[2]! && rel(rs[2], rs[0])! <= -REL)
        add({ priority: "onemli", kind: "risk", title: "Performansı sürekli düşüyor", entity: ent, finding: `Son üç haftada ROAS her hafta düştü: ${rs.map((x) => F.x(x)).join(" → ")}.`,
          metrics: rs.map((x, i) => ({ label: `${i + 1}. hafta ROAS`, value: F.x(x) })), action: "Kreatif yenileme ve hedef kitle genişletmeyi değerlendirin; frekans verisi Kampanya Detayı'nda incelenebilir.", basis: ["3 ardışık 7 günlük dönem", `her hafta ≥${MIN_CONV} dönüşüm`, "toplam düşüş ≥ %20"] });
    }
    return { id: c.id, name: c.name, verdict, lines, actions, changes: changes.filter((x) => x.enough), spend: c.cur.spend, roas: r.roas, conversions: c.cur.conversions, cpa: r.cpa };
  });

  // ── Kreatifler ─────────────────────────────────────────────────────────
  const creativeFindings = { best: [] as string[], declining: [] as string[], spendNoConv: [] as string[], ctrUp: [] as string[], roasDown: [] as string[] };
  const okCreatives = inp.creatives.filter((c) => c.cur.conversions >= MIN_CONV);
  for (const c of [...okCreatives].sort((a, b) => (ratios(b.cur).roas ?? 0) - (ratios(a.cur).roas ?? 0)).slice(0, 3))
    if (base.roas && (ratios(c.cur).roas ?? 0) >= base.roas) creativeFindings.best.push(c.id);
  for (const c of inp.creatives) {
    const ent = { type: "kreatif" as const, id: c.id, name: c.name }, r = ratios(c.cur), ch = compare(c.cur, c.prev);
    const ctr = ch.find((x) => x.metric === "ctr")!, roas = ch.find((x) => x.metric === "roas")!;
    if (ctr.significant && ctr.rel! > 0) {
      creativeFindings.ctrUp.push(c.id);
      add({ priority: "firsat", kind: "firsat", title: "Performansı yükselen kreatif", entity: ent, finding: `CTR ${F.pct(ctr.from, 2)} → ${F.pct(ctr.to, 2)} (${signed(ctr.rel, F.pct)}).`, metrics: [{ label: "CTR", value: F.pct(ctr.to, 2) }, { label: "Gösterim", value: F.n(c.cur.impressions) }], action: "Bu kreatifin mesajını ve görsel yaklaşımını diğer reklamlarda denemeyi değerlendirin.", basis: [`≥${MIN_IMPRESSIONS} gösterim her dönemde`, "%95 güven testi", "≥%20 değişim"] });
    }
    if (roas.significant && roas.rel! < 0) {
      creativeFindings.roasDown.push(c.id);
      add({ priority: "onemli", kind: "dusus", title: "ROAS'ı düşen kreatif", entity: ent, finding: `ROAS ${F.x(roas.from)} → ${F.x(roas.to)} (${signed(roas.rel, F.pct)}).`, metrics: [{ label: "ROAS", value: F.x(roas.to) }, { label: "Harcama", value: F.money(c.cur.spend) }], action: "Kreatifi yenilemeyi ya da daha iyi performans gösteren varyantla değiştirmeyi değerlendirin.", basis: [`her dönemde ≥${MIN_CONV} dönüşüm`, "≥%20 değişim"] });
    }
    if (base.cpa && c.cur.conversions === 0 && c.cur.spend >= 3 * base.cpa) {
      creativeFindings.spendNoConv.push(c.id);
      add({ priority: "kritik", kind: "risk", title: "Yüksek harcama, dönüşüm yok (kreatif)", entity: ent, finding: `${F.money(c.cur.spend)} harcama, 0 dönüşüm (ortalama CPA ${F.money(base.cpa)}).`, metrics: [{ label: "Harcama", value: F.money(c.cur.spend) }, { label: "Tıklama", value: F.n(c.cur.clicks) }], action: "Kreatifi duraklatmayı ya da değiştirmeyi değerlendirin (otomatik işlem yapılmaz).", basis: ["harcama ≥ 3 × ortalama CPA", "dönüşüm = 0"] });
    }
    if (base.cpa && r.cpa !== null && c.cur.conversions >= MIN_CONV && r.cpa <= base.cpa * 0.7)
      add({ priority: "firsat", kind: "firsat", title: "Düşük CPA ile dönüşüm getiren reklam", entity: ent, finding: `CPA ${F.money(r.cpa)}, platform ortalaması ${F.money(base.cpa)}.`, metrics: [{ label: "CPA", value: F.money(r.cpa) }, { label: "Dönüşüm", value: F.n(c.cur.conversions, 1) }], action: "Bu reklama ayrılan bütçe payını artırmayı değerlendirin.", basis: [`≥${MIN_CONV} dönüşüm`, "CPA ≤ 0,7 × ortalama"] });
  }

  // ── Ürünler (ürün analizi sınıflandırmasından) ─────────────────────────
  const prod = {
    best: inp.products.filter((p) => p.status === "iyi").sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0)).slice(0, 5),
    weak: inp.products.filter((p) => p.status === "satissiz" || p.status === "dusuk").sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0)).slice(0, 5),
    potential: inp.products.filter((p) => p.revenue > 0 && (p.spend === 0)).sort((a, b) => b.revenue - a.revenue).slice(0, 5),
  };
  for (const p of prod.weak)
    add({ priority: p.status === "satissiz" ? "onemli" : "bilgi", kind: "risk", title: p.status === "satissiz" ? "Reklam harcaması var, satış yok (ürün)" : "Düşük getirili ürün", entity: { type: "urun", id: p.key, name: p.name },
      finding: `Ürün harcaması ${F.money(p.spend)}, ${inp.productRoasBasis} ROAS ${F.x(p.roas)}, ${p.orders} sipariş.`, metrics: [{ label: "Ürün harcaması", value: F.money(p.spend) }, { label: "ROAS", value: F.x(p.roas) }],
      action: "Ürün sayfasını, fiyatı ve stok durumunu inceleyin; reklam setinden çıkarmayı değerlendirin.", basis: ["platformun ürün kırılımı (tahmini dağıtım yok)", "ürün analizi eşikleri"] });
  for (const p of prod.best)
    add({ priority: "firsat", kind: "firsat", title: "Bütçe artırımı değerlendirilebilecek ürün", entity: { type: "urun", id: p.key, name: p.name },
      finding: `${inp.productRoasBasis} ROAS ${F.x(p.roas)}, ürün harcaması ${F.money(p.spend)}.`, metrics: [{ label: "ROAS", value: F.x(p.roas) }, { label: "Ciro (ikas)", value: F.money(p.revenue) }],
      action: "Ürünün katalog/alışveriş kampanyalarındaki görünürlüğünü artırmayı değerlendirin.", basis: ["ürün analizinde 'yüksek performans'", "yeterli veri eşiği"] });

  // ── Özet ───────────────────────────────────────────────────────────────
  const rankable = campaignAnalyses.filter((c) => c.conversions >= MIN_CONV && c.roas !== null);
  const best = [...rankable].sort((a, b) => b.roas! - a.roas!)[0] ?? null;
  const worstNoConv = campaignAnalyses.filter((c) => base.cpa && c.conversions === 0 && c.spend >= 3 * base.cpa).sort((a, b) => b.spend - a.spend)[0];
  const worst = worstNoConv ?? ([...rankable].sort((a, b) => a.roas! - b.roas!)[0] ?? null);
  const s = (m: Change["metric"]) => tc(m);
  const summary: string[] = [];
  if (!inp.prevTotal) summary.push(`Önceki eş dönemde ${P} verisi yok; değişimler hesaplanamaz.`);
  else {
    const sr = s("spend").rel;
    summary.push(sr === null
      ? `Önceki eş dönemde ${P} harcaması yoktu (${F.money(s("spend").from)} → ${F.money(s("spend").to)}); yüzde değişim hesaplanamaz.`
      : `Son ${inp.days} günde ${P} harcamanız önceki eş döneme göre ${signed(sr, F.pct)} değişti (${F.money(s("spend").from)} → ${F.money(s("spend").to)}).`);
    const vr0 = rel(inp.total.value, inp.prevTotal.value), cr0 = rel(inp.total.conversions, inp.prevTotal.conversions);
    summary.push(vr0 === null && cr0 === null
      ? `Önceki dönemde dönüşüm değeri ve ${convWord} olmadığı için bu değişimler hesaplanamaz.`
      : `Platformun raporladığı dönüşüm değeri ${vr0 === null ? "için değişim hesaplanamaz" : `${signed(vr0, F.pct)} değişti`}; ${convWord} sayısı ${cr0 === null ? "için değişim hesaplanamaz" : `${signed(cr0, F.pct)} değişti`}.`);
    const roas = s("roas");
    summary.push(roas.enough ? `ROAS ${F.x(roas.from)} → ${F.x(roas.to)} (${signed(roas.rel, F.pct)})${roas.significant ? "" : "; bu değişim anlamlılık eşiğinin altında"}.` : `ROAS karşılaştırması için her iki dönemde en az ${MIN_CONV} dönüşüm gerekir; yeterli veri yok.`);
    const sp = s("spend").rel, vr = rel(inp.total.value, inp.prevTotal.value);
    if (sp !== null && vr !== null && roas.significant && sp - vr >= REL)
      summary.push(Math.abs(sp) < 0.05 && vr < 0 ? "Harcama yaklaşık aynı kalırken dönüşüm değeri azalmış." : sp > 0 && vr > 0 ? "Harcama artışı, dönüşüm değeri artışından hızlı gerçekleşmiş." : sp > 0 ? "Harcama artarken dönüşüm değeri azalmış." : vr < 0 && sp >= 0 ? "Harcama yaklaşık aynı kalırken dönüşüm değeri azalmış." : "Dönüşüm değeri, harcamadan daha hızlı azalmış.");
    if (sp !== null && vr !== null && roas.significant && vr - sp >= REL)
      summary.push(Math.abs(sp) < 0.05 && vr > 0 ? "Harcama yaklaşık aynı kalırken dönüşüm değeri artmış." : vr > 0 && sp > 0 ? "Dönüşüm değeri, harcamadan daha hızlı artmış." : vr > 0 ? "Harcama azalırken dönüşüm değeri artmış." : "Harcama, dönüşüm değerinden daha hızlı azalmış.");
  }
  if (best) summary.push(`En başarılı kampanya: ${best.name} (ROAS ${F.x(best.roas)}, ${F.n(best.conversions, 1)} dönüşüm).`);
  if (worst && worst.id !== best?.id) summary.push(worst.conversions === 0 ? `Dikkat gerektiren kampanya: ${worst.name} (${F.money(worst.spend)} harcama, dönüşüm yok).` : `En düşük ROAS'lı kampanya (yeterli veriyle): ${worst.name} (ROAS ${F.x(worst.roas)}).`);
  if (!best && !worst) summary.push(`Kampanya sıralaması için yeterli veri yok (kampanya başına en az ${MIN_CONV} dönüşüm).`);

  const order: Record<Priority, number> = { kritik: 0, onemli: 1, firsat: 2, bilgi: 3 };
  insights.sort((a, b) => order[a.priority] - order[b.priority]);
  return { summary, totalChanges, insights, campaignAnalyses, creativeFindings, products: prod, base };
}
export type EngineResult = ReturnType<typeof runEngine>;
