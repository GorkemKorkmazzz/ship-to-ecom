import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { api, type Order, type Orders } from "../api";
import { Badge, C, Card, Chip, Empty, ErrorBox, Title, dateTime, money, qty, s } from "../ui";

function OrderCard({ o }: { o: Order }) {
  const [open, setOpen] = useState(false);
  const units = o.satirlar.reduce((a, l) => a + l.adet, 0);
  return (
    <Card style={{ marginBottom: 12 }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityLabel={`Sipariş ${o.numara}, ayrıntıları ${open ? "gizle" : "göster"}`}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>#{o.numara}</Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: C.text }}>{money(o.tutar, o.paraBirimi)}</Text>
        </View>
        <Text style={[s.muted, { marginTop: 2 }]}>{o.magaza.ad} · {dateTime(o.tarih)}</Text>
        <Text style={{ fontSize: 14, color: C.text, marginTop: 6 }} numberOfLines={open ? undefined : 1}>
          {qty(units)} adet · {o.satirlar.map((l) => l.ad || l.sku).join(", ")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {o.durum && o.durum.code !== "CREATED" && <Badge label={o.durum.label} tone={o.durum.tone} />}
          {o.odeme && <Badge label={o.odeme.label} tone={o.odeme.tone} />}
          {o.paket && <Badge label={o.paket.label} tone={o.paket.tone} />}
        </View>
      </Pressable>
      {open && (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 10 }}>
          {o.satirlar.map((l, i) => (
            <View key={i} style={[s.row, { justifyContent: "space-between", paddingVertical: 4 }]}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 14, color: C.text }}>{l.ad || "—"}</Text>
                <Text style={{ fontSize: 12, color: C.faint }}>{l.sku}</Text>
              </View>
              <Text style={{ fontSize: 14, color: C.text }}>{qty(l.adet)} × {l.fiyat === null ? "—" : money(l.fiyat, o.paraBirimi)}</Text>
            </View>
          ))}
          {(o.il || o.kargoYontemi) && <Text style={[s.muted, { marginTop: 8 }]}>{[o.ilce, o.il].filter(Boolean).join(" / ")}{o.il && o.kargoYontemi ? " · " : ""}{o.kargoYontemi ?? ""}</Text>}
          {o.kargolar.map((k) => (
            <View key={k.numara} style={{ marginTop: 8, backgroundColor: C.bg, borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>{k.firma ?? "Kargo"}{k.takipNo ? ` · ${k.takipNo}` : ""}</Text>
              {k.barkod && <Text style={s.muted}>Barkod: {k.barkod}</Text>}
              {k.takipLinki && (
                <Pressable onPress={() => Linking.openURL(k.takipLinki!)} accessibilityRole="link" style={{ paddingTop: 8 }}>
                  <Text style={{ color: C.primary, fontSize: 14, fontWeight: "600" }}>Kargo takibini aç</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

export function Siparisler() {
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Orders | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api.orders({ durum: filter, q: search }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    }
  }, [filter, search]);
  useEffect(() => {
    load();
  }, [load]);

  const more = async () => {
    if (!data || data.sayfa >= data.sayfaSayisi || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const next = await api.orders({ durum: filter, q: search, sayfa: data.sayfa + 1 });
      setData({ ...next, siparisler: [...data.siparisler, ...next.siparisler] });
    } catch {}
    loadingMore.current = false;
  };

  return (
    <FlatList
      data={data?.siparisler ?? []}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderCard o={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      onEndReached={more}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View>
          <Title right={data ? <Text style={s.muted}>{data.toplam} sipariş</Text> : null}>Siparişler</Title>
          <TextInput style={[s.input, { marginBottom: 12 }]} value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q.trim())} returnKeyType="search" placeholder="Sipariş no, SKU ya da ürün ara" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Sipariş ara" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <Chip label="Tümü" active={!filter} onPress={() => setFilter("")} />
            {(data?.filtreler ?? []).map((f) => <Chip key={f.anahtar} label={f.ad} active={filter === f.anahtar} onPress={() => setFilter(f.anahtar)} />)}
          </ScrollView>
          <ErrorBox message={error} />
        </View>
      }
      ListEmptyComponent={!error ? <Empty text={data ? "Sipariş yok." : "Yükleniyor…"} /> : undefined}
    />
  );
}
