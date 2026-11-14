// Ortak görünüm parçaları ve biçimlendirme.
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Tone } from "./api";

export const C = { bg: "#f9fafb", card: "#ffffff", border: "#e5e7eb", text: "#111827", muted: "#6b7280", faint: "#9ca3af", primary: "#4f46e5", primarySoft: "#eef2ff", danger: "#dc2626" };
export const STORE_COLORS = ["#0284c7", "#f59e0b", "#059669", "#7c3aed", "#e11d48"];
const TONES: Record<Tone, [string, string]> = { green: ["#d1fae5", "#047857"], amber: ["#fef3c7", "#92400e"], red: ["#fee2e2", "#b91c1c"], gray: ["#f3f4f6", "#374151"], sky: ["#e0f2fe", "#0369a1"] };

export const money = (n: number, currency = "TRY") => {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};
export const dateTime = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
};
export const qty = (n: number | null) => (n === null ? "—" : String(Math.round(n * 100) / 100));

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Badge({ label, tone = "gray" }: { label: string; tone?: Tone }) {
  const [bg, fg] = TONES[tone];
  return <Text style={[s.badge, { backgroundColor: bg, color: fg }]}>{label}</Text>;
}
export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}
export function Button({ label, onPress, busy, ghost }: { label: string; onPress: () => void; busy?: boolean; ghost?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" style={[s.btn, ghost && s.btnGhost, busy && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={ghost ? C.primary : "#fff"} /> : <Text style={[s.btnText, ghost && { color: C.text }]}>{label}</Text>}
    </Pressable>
  );
}
export function ErrorBox({ message }: { message: string | null }) {
  return message ? <Text style={s.error}>{message}</Text> : null;
}
export function Empty({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}
export function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.titleRow}>
      <Text style={s.title}>{children}</Text>
      {right}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16 },
  badge: { alignSelf: "flex-start", overflow: "hidden", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12, fontWeight: "600" },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { fontSize: 14, fontWeight: "500", color: C.muted },
  chipTextOn: { color: "#fff" },
  btn: { minHeight: 48, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  btnGhost: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  error: { backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12, overflow: "hidden" },
  empty: { textAlign: "center", color: C.muted, paddingVertical: 32, fontSize: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", color: C.text },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: C.card, paddingHorizontal: 14, fontSize: 16, color: C.text },
  label: { fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 6 },
  muted: { color: C.muted, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center" },
});
