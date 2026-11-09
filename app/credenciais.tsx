import { useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import { embeddedConfig } from "../src/core/config";
import type { CredentialsError } from "../src/core/createCore";
import { useCore } from "../src/shell/appCore";
import { Button, Fine, font, LinkText, Screen, usePalette } from "../src/shell/theme";

export default function Credenciais() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<CredentialsError | null>(null);

  async function submit() {
    setChecking(true);
    setError(null);
    const result = await core.saveCredentials({ clientId, clientSecret });
    setChecking(false);
    if (result.ok) router.replace("/");
    else setError(result.error);
  }

  const input = {
    fontFamily: font.regular,
    fontSize: 16,
    color: c.ink,
    backgroundColor: c.track,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  } as const;

  return (
    <Screen
      title="Credenciais"
      sub="Copie do Dashboard da Pluggy, na sua aplicação."
      footer={<Button label={checking ? "Conferindo com o Pluggy…" : "Continuar"} disabled={checking} onPress={submit} />}
    >
      <Text style={{ fontFamily: font.medium, color: c.ink2, marginBottom: 6 }}>Client ID</Text>
      <TextInput
        style={input}
        value={clientId}
        onChangeText={setClientId}
        placeholder="Cole aqui"
        placeholderTextColor={c.ink2}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={{ fontFamily: font.medium, color: c.ink2, marginTop: 16, marginBottom: 6 }}>Client Secret</Text>
      <TextInput
        style={input}
        value={clientSecret}
        onChangeText={setClientSecret}
        placeholder="Cole aqui"
        placeholderTextColor={c.ink2}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ marginTop: 12 }}>
        <LinkText onPress={() => Linking.openURL(embeddedConfig.guideUrl)}>Onde encontro isso?</LinkText>
      </View>
      <View style={{ marginTop: 20, gap: 8 }}>
        <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>Nunca envie o Client Secret para ninguém</Text>
        <Fine>Perdeu o celular? Gere um novo Client Secret no Dashboard da Pluggy.</Fine>
      </View>
      {error ? (
        <View style={{ marginTop: 20, gap: 6 }}>
          <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>{error.message}</Text>
          <LinkText onPress={() => Linking.openURL(error.helpUrl)}>Ver em Problemas comuns</LinkText>
        </View>
      ) : null}
    </Screen>
  );
}
