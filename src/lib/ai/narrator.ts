// Sağlayıcıdan bağımsız doğal dil açıklama servisi. Yalnızca sunucu kodundan içe aktarılır (istemci bileşeni içe aktarmaz); anahtar ortam değişkeninden okunur
// (frontend'e, veritabanına ya da günlüklere yazılmaz).
// Yapay zekâ analiz YAPMAZ: kural motorunun doğruladığı olguları Türkçe, anlaşılır bir metne dönüştürür.
// Güvenlik: çıktıdaki her sayı girdideki olgularda geçmelidir; geçmeyen sayı varsa çıktı atılır ve kural tabanlı metin kullanılır.
// Yapılandırma: AI_PROVIDER=anthropic + ANTHROPIC_API_KEY (isteğe bağlı AI_MODEL). Yapılandırma yoksa servis "kapalı" döner.

export type NarrationResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; reason: "disabled" | "error" | "rejected"; detail: string };

export interface Narrator {
  readonly provider: string;
  readonly model: string;
  narrate(system: string, facts: string): Promise<string>;
}

/** Anthropic sağlayıcısı (resmi SDK). */
async function anthropicNarrator(): Promise<Narrator | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ timeout: 45_000, maxRetries: 1 });
  const model = process.env.AI_MODEL || "claude-opus-5-5";
  return {
    provider: "anthropic", model,
    async narrate(system, facts) {
      const res = await client.beta.messages.create({
        model, max_tokens: 4000, system,
        output_config: { effort: "low" }, // kısa yeniden yazım görevi
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", // güvenlik sınıflandırıcısı reddederse sunucu tarafı yedek model
        messages: [{ role: "user", content: facts }],
      });
      if (res.stop_reason === "refusal") throw new Error("Model isteği reddetti");
      return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    },
  };
}

const PROVIDERS: Record<string, () => Promise<Narrator | null>> = { anthropic: anthropicNarrator };

export async function getNarrator(): Promise<Narrator | null> {
  const name = (process.env.AI_PROVIDER || "").toLowerCase();
  return PROVIDERS[name] ? PROVIDERS[name]() : null;
}

/** Metindeki sayılar (1.234,5 / %12 / 3,51 biçimleri) normalize edilir. */
export function numbersIn(s: string) {
  return (s.match(/\d[\d.,]*/g) ?? []).map((x) => x.replace(/\./g, "").replace(",", ".").replace(/[.,]$/, "")).filter((x) => x && x !== ".");
}
/** Çıktıdaki her sayının olgularda geçtiğini doğrular (küçük sıra sayıları 1-10 serbest). */
export function unsupportedNumbers(output: string, facts: string) {
  const allowed = new Set(numbersIn(facts));
  return numbersIn(output).filter((n) => !allowed.has(n) && !(Number(n) >= 0 && Number(n) <= 10 && /^\d+$/.test(n)));
}

const SYSTEM = [
  "Bir e-ticaret reklam analisti gibi Türkçe yazıyorsun.",
  "Sana kural tabanlı bir analiz motorunun DOĞRULANMIŞ olguları verilecek. Görevin bunları mağaza sahibinin anlayacağı, kısa ve akıcı bir özete dönüştürmek.",
  "Kurallar: Yalnızca verilen olguları kullan. Yeni sayı, yüzde, tutar, tarih ya da kampanya adı ekleme; sayıları olduğu gibi yaz.",
  "Neden-sonuç iddiası kurma; olgularda 'neden-sonuç değildir' deniyorsa bunu koru. Meta ve Google verilerini birbirine ekleme.",
  "Bir şeyi otomatik uyguladığını ya da uygulayacağını söyleme; öneriler kullanıcının kararıdır.",
  "En fazla 2 kısa paragraf ve ardından en fazla 4 maddelik 'Öncelikli adımlar' listesi yaz. Başlık, emoji kullanma.",
].join(" ");

export async function narrate(facts: string, narrator?: Narrator | null): Promise<NarrationResult> {
  const n = narrator === undefined ? await getNarrator() : narrator;
  if (!n) return { ok: false, reason: "disabled", detail: "Yapay zekâ sağlayıcısı yapılandırılmamış (AI_PROVIDER / API anahtarı)." };
  let text: string;
  try {
    text = await n.narrate(SYSTEM, facts);
  } catch (e) {
    // Anahtar ya da istek gövdesi günlüğe yazılmaz; yalnızca hata sınıfı/mesajı.
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message.slice(0, 200) : "Bilinmeyen hata" };
  }
  if (!text) return { ok: false, reason: "error", detail: "Boş yanıt" };
  const bad = unsupportedNumbers(text, facts);
  if (bad.length) return { ok: false, reason: "rejected", detail: `Yanıtta olgularda olmayan sayılar vardı (${bad.slice(0, 5).join(", ")}); kural tabanlı metin gösteriliyor.` };
  return { ok: true, text, provider: n.provider, model: n.model };
}
