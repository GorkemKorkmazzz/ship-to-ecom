import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { api, type Stock, type StockRow } from "../api";
import { Badge, C, Card, Chip, Empty, ErrorBox, Title, qty, s } from "../ui";

function Row({ r }: { r: StockRow }) {
  const out = r.ortak !== null && r.ortak <= 0;
  return (
    <Card style={{ marginBottom: 10 }}>
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }} numberOfLines={2}>{r.ad || "—"}</Text>
          <Text style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>{r.sku}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: out ? C.danger : r.dusuk ? "#b45309" : C.text }}>{qty(r.ortak)}</Text>
          <Text style={{ fontSize: 11, color: C.faint }}>ortak stok</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {out && <Badge label="Tükendi" tone="red" />}
        {!out && r.dusuk && <Badge label="Düşük stok" tone="amber" />}
        {r.ortak === null && !r.haric && <Badge label="Eşleşmemiş" tone="gray" />}
        {r.haric && <Badge label="Senkron dışı" tone="gray" />}
      </View>
      <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 8 }}>
        {r.magazalar.map((m) => (
          <View key={m.id} style={[s.row, { justifyContent: "space-between", paddingVertical: 2 }]}>
            <Text style={s.muted}>{m.ad}</Text>
            <Text style={{ fontSize: 14, color: m.stok === null ? C.faint : C.text }}>{m.stok === null ? "yok" : qty(m.stok)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function Stok() {
  const [filter, setFilter] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Stock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api.stock({ f: filter, q: search }));
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
      const next = await api.stock({ f: filter, q: search, sayfa: data.sayfa + 1 });
      setData({ ...next, urunler: [...data.urunler, ...next.urunler] });
    } catch {}
    loadingMore.current = false;
  };

  const n = data?.sayilar;
  const filters: [string, string][] = [["", `Tümü${n ? ` ${n.tum}` : ""}`], ["dusuk", `Düşük${n ? ` ${n.dusuk}` : ""}`], ["tukenen", `Tükenen${n ? ` ${n.tukenen}` : ""}`], ["eslesmeyen", `Eşleşmeyen${n ? ` ${n.eslesmeyen}` : ""}`]];

  return (
    <FlatList
      data={data?.urunler ?? []}
      keyExtractor={(r) => r.sku}
      renderItem={({ item }) => <Row r={item} />}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      onEndReached={more}
      onEndReachedThreshold={0.4}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      ListHeaderComponent={
        <View>
          <Title>Stok</Title>
          <TextInput style={[s.input, { marginBottom: 12 }]} value={q} onChangeText={setQ} onSubmitEditing={() => setSearch(q.trim())} returnKeyType="search" placeholder="SKU ya da ürün adı ara" placeholderTextColor={C.faint} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Stokta ara" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {filters.map(([key, label]) => <Chip key={key} label={label} active={filter === key} onPress={() => setFilter(key)} />)}
          </ScrollView>
          <ErrorBox message={error} />
        </View>
      }
      ListEmptyComponent={!error ? <Empty text={data ? "Kayıt yok." : "Yükleniyor…"} /> : undefined}
    />
  );
}
