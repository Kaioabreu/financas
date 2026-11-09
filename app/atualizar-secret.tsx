import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import { embeddedConfig } from "../src/core/config";
import type { CredentialsError } from "../src/core/createCore";
import { CopyDiagnostic } from "../src/shell/CopyDiagnostic";
import { useCore } from "../src/shell/appCore";
import { Button, Fine, font, LinkText, Screen, usePalette } from "../src/shell/theme";

/** The Pluggy refused the credentials: only the Client Secret changes, the Client ID stays. */
export default function AtualizarSecret() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<CredentialsError | null>(null);

  useEffect(() => {
    void core.credentialsStatus().then((s) => setClientId(s.saved ? s.clientId : ""));
  }, [core]);

  async function submit() {
    setChecking(true);
    setError(null);
    const result = await core.updateClientSecret(secret);
    setChecking(false);
    if (result.ok) router.back();
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
      title="Atualizar Client Secret"
      sub="Gere um novo Client Secret no Dashboard da Pluggy e cole aqui."
      footer={<Button label={checking ? "Conferindo com o Pluggy…" : "Salvar"} disabled={checking || !secret.trim()} onPress={submit} />}
    >
      <Text style={{ fontFamily: font.medium, color: c.ink2, marginBottom: 6 }}>Client ID</Text>
      <TextInput style={[input, { opacity: 0.6 }]} value={clientId} editable={false} />
      <Text style={{ fontFamily: font.medium, color: c.ink2, marginTop: 16, marginBottom: 6 }}>Client Secret</Text>
      <TextInput
        style={input}
        value={secret}
        onChangeText={setSecret}
        placeholder="Cole aqui"
        placeholderTextColor={c.ink2}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={{ marginTop: 12 }}>
        <LinkText onPress={() => Linking.openURL(embeddedConfig.guideUrl)}>Onde encontro isso?</LinkText>
      </View>
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>Nunca envie o Client Secret para ninguém</Text>
        <Fine>Seus dados e Conexões ficam como estão.</Fine>
      </View>
      {error ? (
        <View style={{ marginTop: 20, gap: 6 }}>
          <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>{error.message}</Text>
          <LinkText onPress={() => Linking.openURL(error.helpUrl)}>Ver em Problemas comuns</LinkText>
          <CopyDiagnostic />
        </View>
      ) : null}
    </Screen>
  );
}
