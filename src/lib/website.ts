/** Alan adını tek biçime getirir: protokol, www, yol, port ve sondaki nokta atılır; küçük harfe çevrilir. Geçersizse null. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "").replace(/^www\./, "");
  if (d.length > 253) return null;
  // Türkçe karakterli alan adları IDN (punycode) biçimine çevrilir.
  try {
    d = new URL(`http://${d}`).hostname;
  } catch {
    return null;
  }
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const parts = d.split(".");
  return parts.length >= 2 && parts.every((p) => label.test(p)) && /[a-z]/.test(parts.at(-1)!) ? d : null;
}
