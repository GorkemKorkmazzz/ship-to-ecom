import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { api, type Report, type ReportRow } from "../api";
import { C, Card, Chip, Empty, ErrorBox, Title, money, s } from "../ui";

const RANGES: [number, string][] = [[7, "7 gün"], [30, "30 gün"], [90, "90 gün"], [365, "1 yıl"]];

/** Bir kırılım: ad, adet, tutar ve en büyük satıra göre oranlı çubuk. */
function Breakdown({ title, hint, unit, rows, currency }: { title: string; hint?: string; unit: string; rows: ReportRow[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.tutar));
  const total = rows.reduce((a, r) => a + r.tutar, 0);
  return (
    <Card style={{ marginTop: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: "600", color: C.text }}>{title}</Text>
      {hint && <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{hint}</Text>}
      {rows.map((r) => (
        <View key={r.ad} style={{ marginTop: 12 }}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: C.text, paddingRight: 8 }} numberOfLines={1}>{r.ad}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: C.text }}>{money(r.tutar, currency)}</Text>
          </View>
          <View style={[s.row, { justifyContent: "space-between", marginTop: 1 }]}>
            <Text style={{ fontSize: 12, color: C.muted }}>{r.adet} {unit}</Text>
            <Text style={{ fontSize: 12, color: C.faint }}>%{total ? Math.round((r.tutar / total) * 100) : 0}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: "#f3f4f6", marginTop: 5 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.primary, width: `${Math.max(2, (r.tutar / max) * 100)}%` }} />
          </View>
        </View>
      ))}
      {!rows.length && <Text style={{ color: C.muted, fontSize: 14, paddingVertical: 14, textAlign: "center" }}>Bu dönemde veri yok.</Text>}
    </Card>
  );
}

export function Raporlar() {
  const [range, setRange] = useState(30);
  const [store, setStore] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.report(range, store));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi.");
    }
  }, [range, store]);
  useEffect(() => {
    load();
  }, [load]);

  const cur = data?.paraBirimi ?? "TRY";
  const kpis: [string, string][] = data
    ? [["Ciro", money(data.ozet.ciro, cur)], ["Sipariş", String(data.ozet.siparis)], ["Ort. sepet", money(data.ozet.ortalama, cur)], ["Kampanya indirimi", money(data.ozet.indirim, cur)], ["Terk edilen sepet", String(data.ozet.terkEdilenSepet)]]
    : [];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Title>Raporlar</Title>
      <Text style={[s.muted, { marginTop: -8, marginBottom: 12 }]}>İptal ve taslak siparişler hariç · müşteri bilgisi kullanılmaz</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {RANGES.map(([r, label]) => <Chip key={r} label={label} active={range === r} onPress={() => setRange(r)} />)}
      </ScrollView>
      {data && data.magazalar.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <Chip label="Tüm mağazalar" active={!store} onPress={() => setStore("")} />
          {data.magazalar.map((m) => <Chip key={m.id} label={m.ad} active={store === m.id} onPress={() => setStore(m.id)} />)}
        </ScrollView>
      )}
      <ErrorBox message={error} />
      {!data ? (
        !error && <Empty text="Yükleniyor…" />
      ) : (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
            {kpis.map(([k, v], i) => (
              <View key={k} style={{ width: i === 0 ? "100%" : "50%", padding: 5 }}>
                <Card>
                  <Text style={s.muted}>{k}</Text>
                  <Text style={{ fontSize: i === 0 ? 28 : 20, fontWeight: "700", color: C.text, marginTop: 2 }}>{v}</Text>
                </Card>
              </View>
            ))}
          </View>
          {data.ozet.siparis > 0 && !data.raporAlaniVar && (
            <Text style={{ backgroundColor: "#fffbeb", color: "#92400e", borderRadius: 10, padding: 12, fontSize: 13, marginTop: 10, overflow: "hidden" }}>
              Bu dönemdeki siparişlerde kanal, kaynak ve il bilgisi yok. Bu alanlar yeni senkronla gelir.
            </Text>
          )}
          {data.gruplar.map((g) => (
            <View key={g.baslik} style={{ marginTop: 22 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1, color: C.faint, textTransform: "uppercase" }}>{g.baslik}</Text>
              {g.bolumler.map((b) => <Breakdown key={b.baslik} title={b.baslik} hint={b.ipucu} unit={b.birim} rows={b.satirlar} currency={cur} />)}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
