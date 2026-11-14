import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api, getServer, logout, type Me } from "../api";
import { Badge, Button, C, Card, Empty, ErrorBox, Title, dateTime, s } from "../ui";

const DURUM: Record<string, [string, "green" | "sky" | "amber" | "red"]> = { odeme: ["Aktif", "green"], deneme: ["Deneme", "sky"], "suresi-doldu": ["Süresi doldu", "amber"], askida: ["Askıda", "red"] };

export function Hesap({ onLogout }: { onLogout: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMe(await api.me());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    setNote(null);
    setError(null);
    try {
      const r = await api.sync();
      if (r.tamam) setNote("Senkron tamamlandı.");
      else setError(r.hatalar.join("\n"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senkron başarısız.");
    }
    setSyncing(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Title>Hesap</Title>
      <ErrorBox message={error} />
      {note && <Text style={{ backgroundColor: "#ecfdf5", color: "#047857", borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12, overflow: "hidden" }}>{note}</Text>}
      {!me ? (
        !error && <Empty text="Yükleniyor…" />
      ) : (
        <>
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{me.email}</Text>
            <View style={[s.row, { marginTop: 8, gap: 8 }]}>
              <Text style={s.muted}>{me.paket} paketi</Text>
              {DURUM[me.durum] && <Badge label={DURUM[me.durum][0]} tone={DURUM[me.durum][1]} />}
            </View>
            <Text style={[s.muted, { marginTop: 8 }]}>{me.magazalar.length} / {me.magazaHakki} mağaza bağlı</Text>
          </Card>
          {me.magazalar.map((m) => (
            <Card key={m.id} style={{ marginTop: 12 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{m.ad}</Text>
                <Badge label={m.hata ? "Hata" : "Bağlı"} tone={m.hata ? "red" : "green"} />
              </View>
              <Text style={[s.muted, { marginTop: 4 }]}>{m.adres} · {m.platform}</Text>
              <Text style={[s.muted, { marginTop: 2 }]}>Son senkron: {dateTime(m.sonSenkron)}</Text>
              {m.hata && <Text style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{m.hata}</Text>}
            </Card>
          ))}
          {!me.magazalar.length && <Empty text="Bağlı mağaza yok. Mağazalar web panelinden bağlanır." />}
          <View style={{ marginTop: 16 }}>
            <Button label="Şimdi senkronize et" onPress={sync} busy={syncing} />
          </View>
        </>
      )}
      <View style={{ marginTop: 12 }}>
        <Button label="Çıkış yap" ghost onPress={async () => { await logout(); onLogout(); }} />
      </View>
      <Text style={[s.muted, { textAlign: "center", marginTop: 16 }]}>Sunucu: {getServer()}</Text>
    </ScrollView>
  );
}
