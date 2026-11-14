import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api, type Summary } from "../api";
import { C, Card, Chip, Empty, ErrorBox, STORE_COLORS, Title, dateTime, money, qty, s } from "../ui";

const RANGES = [7, 30, 90];

/** Günlük ciro çubukları; mağazalar üst üste yığılır. */
function Bars({ data }: { data: Summary }) {
  const totals = data.gunler.map((_, i) => data.magazalar.reduce((a, m) => a + m.seri[i], 0));
  const max = Math.max(1, ...totals);
  const step = Math.ceil(data.gunler.length / 7);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 120, gap: data.gunler.length > 30 ? 1 : 3 }}>
        {data.gunler.map((g, i) => (
          <View key={g} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }} accessibilityLabel={`${g}: ${money(totals[i], data.paraBirimi)}`}>
            {data.magazalar.map((m, k) => (m.seri[i] > 0 ? <View key={m.id} style={{ height: Math.max(2, (m.seri[i] / max) * 120), backgroundColor: STORE_COLORS[k % STORE_COLORS.length], borderRadius: 2 }} /> : null))}
            {totals[i] === 0 && <View style={{ height: 2, backgroundColor: C.border }} />}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        {data.gunler.map((g, i) => (
          <Text key={g} style={{ flex: 1, fontSize: 10, color: C.faint, textAlign: "center" }} numberOfLines={1}>
            {i % step === 0 ? `${g.slice(8, 10)}.${g.slice(5, 7)}` : ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function Ozet() {
  const [range, setRange] = useState(7);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.summary(range));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    }
  }, [range]);
  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <Title>Özet</Title>
      <View style={[s.row, { marginBottom: 12 }]}>
        {RANGES.map((r) => <Chip key={r} label={`${r} gün`} active={range === r} onPress={() => setRange(r)} />)}
      </View>
      <ErrorBox message={error} />
      {!data ? (
        !error && <Empty text="Yükleniyor…" />
      ) : (
        <>
          <Card>
            <Text style={s.muted}>Toplam satış</Text>
            <Text style={{ fontSize: 30, fontWeight: "700", color: C.text, marginTop: 2 }}>{money(data.toplam.ciro, data.paraBirimi)}</Text>
            <View style={{ flexDirection: "row", marginTop: 14 }}>
              {[["Sipariş", String(data.toplam.siparis)], ["Adet", qty(data.toplam.adet)], ["Ort. sipariş", money(data.toplam.ortalama, data.paraBirimi)]].map(([k, v]) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={s.muted}>{k}</Text>
                  <Text style={{ fontSize: 17, fontWeight: "600", color: C.text }}>{v}</Text>
                </View>
              ))}
            </View>
            <View style={{ marginTop: 18 }}>
              <Bars data={data} />
            </View>
          </Card>

          {data.magazalar.map((m, k) => (
            <Card key={m.id} style={{ marginTop: 12 }}>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <View style={s.row}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: m.hata ? C.danger : STORE_COLORS[k % STORE_COLORS.length], marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{m.ad}</Text>
                </View>
                <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{money(m.ciro, data.paraBirimi)}</Text>
              </View>
              <Text style={[s.muted, { marginTop: 4 }]}>{m.siparis} sipariş</Text>
              {m.hata && <Text style={{ color: C.danger, fontSize: 13, marginTop: 6 }}>{m.hata}</Text>}
            </Card>
          ))}

          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 8 }}>Stok durumu</Text>
            <View style={{ flexDirection: "row" }}>
              {([["Ortak SKU", data.stok.ortak, C.text], ["Düşük stok", data.stok.dusuk, data.stok.dusuk ? "#b45309" : C.text], ["Tükenen", data.stok.tukenen, data.stok.tukenen ? C.danger : C.text]] as const).map(([k, v, color]) => (
                <View key={k} style={{ flex: 1 }}>
                  <Text style={s.muted}>{k}</Text>
                  <Text style={{ fontSize: 22, fontWeight: "700", color }}>{v}</Text>
                </View>
              ))}
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: C.text, marginBottom: 4 }}>En çok satanlar</Text>
            {data.enCokSatanlar.map((t) => (
              <View key={t.sku} style={[s.row, { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 15, fontWeight: "500", color: C.text }} numberOfLines={1}>{t.ad || "—"}</Text>
                  <Text style={{ fontSize: 12, color: C.faint }}>{t.sku}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>{money(t.ciro, data.paraBirimi)}</Text>
                  <Text style={s.muted}>{qty(t.adet)} adet</Text>
                </View>
              </View>
            ))}
            {!data.enCokSatanlar.length && <Empty text="Bu dönemde satış yok." />}
          </Card>
          <Text style={[s.muted, { textAlign: "center", marginTop: 16 }]}>Son senkron: {dateTime(data.sonSenkron)}</Text>
        </>
      )}
    </ScrollView>
  );
}
