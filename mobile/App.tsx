import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { restore, setOnExpired } from "./src/api";
import { Hesap } from "./src/screens/Hesap";
import { Login } from "./src/screens/Login";
import { Ozet } from "./src/screens/Ozet";
import { Raporlar } from "./src/screens/Raporlar";
import { Siparisler } from "./src/screens/Siparisler";
import { Stok } from "./src/screens/Stok";
import { C } from "./src/ui";

const TABS = [
  { key: "ozet", label: "Özet", icon: "▦" },
  { key: "siparisler", label: "Siparişler", icon: "☰" },
  { key: "stok", label: "Stok", icon: "▤" },
  { key: "raporlar", label: "Raporlar", icon: "◔" },
  { key: "hesap", label: "Hesap", icon: "◉" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function Shell() {
  const insets = useSafeAreaInsets();
  // null: oturum denetleniyor · false: giriş gerekli · true: içeride
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("ozet");

  useEffect(() => {
    setOnExpired(() => setAuthed(false));
    restore().then(setAuthed, () => setAuthed(false));
  }, []);

  if (authed === null) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}><ActivityIndicator color={C.primary} /></View>;
  if (!authed) return <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}><Login onDone={() => { setTab("ozet"); setAuthed(true); }} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={{ flex: 1 }}>
        {tab === "ozet" && <Ozet />}
        {tab === "siparisler" && <Siparisler />}
        {tab === "stok" && <Stok />}
        {tab === "raporlar" && <Raporlar />}
        {tab === "hesap" && <Hesap onLogout={() => setAuthed(false)} />}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.card, paddingBottom: insets.bottom }} accessibilityRole="tablist">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={t.label} style={{ flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 6, minHeight: 52 }}>
              <Text style={{ fontSize: 18, color: active ? C.primary : C.faint }}>{t.icon}</Text>
              <Text style={{ fontSize: 11, fontWeight: active ? "700" : "500", color: active ? C.primary : C.muted, marginTop: 2 }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Shell />
    </SafeAreaProvider>
  );
}
