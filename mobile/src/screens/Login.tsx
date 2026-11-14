import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { defaultServer, getServer, login } from "../api";
import { Button, C, ErrorBox, s } from "../ui";

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(getServer());
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError("E-posta ve şifrenizi girin.");
    setBusy(true);
    setError(null);
    try {
      await login(server, email.trim(), password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Giriş yapılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 30, fontWeight: "800", color: C.text }}>
          Ship<Text style={{ color: C.primary }}>To</Text>Ecom
        </Text>
        <Text style={[s.muted, { marginTop: 4, marginBottom: 28, fontSize: 15 }]}>E-ticaret mağazalarınız, tek stok.</Text>
        <ErrorBox message={error} />
        <Text style={s.label}>E-posta</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" accessibilityLabel="E-posta" />
        <Text style={[s.label, { marginTop: 14 }]}>Şifre</Text>
        <TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={submit} accessibilityLabel="Şifre" />
        <View style={{ height: 20 }} />
        <Button label="Giriş yap" onPress={submit} busy={busy} />
        <Pressable onPress={() => setAdvanced((v) => !v)} style={{ paddingVertical: 16 }} accessibilityRole="button">
          <Text style={[s.muted, { textAlign: "center" }]}>{advanced ? "Sunucu ayarını gizle" : "Sunucu adresi"}</Text>
        </Pressable>
        {advanced && (
          <View>
            <TextInput style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" accessibilityLabel="Sunucu adresi" />
            <Text style={[s.muted, { marginTop: 6 }]}>Varsayılan: {defaultServer()}</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
