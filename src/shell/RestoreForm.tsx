import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { Linking, Text, TextInput, View } from "react-native";
import type { RestoreInput, RestoreResult } from "../core/restore";
import { Button, Fine, font, LinkText, Screen, usePalette } from "./theme";

/**
 * Restaurar backup: choose the file, type its password, paste the Client Secret (the Client ID is in the backup).
 * `run` does the restore; `onDone` is called after it succeeded.
 */
export function RestoreForm({ run, onDone, onCancel }: { run: (input: RestoreInput) => Promise<RestoreResult>; onDone: () => void; onCancel?: () => void }) {
  const c = usePalette();
  const [file, setFile] = useState<{ uri: string; name: string } | null>(null);
  const [password, setPassword] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; helpUrl?: string } | null>(null);

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) setFile({ uri: result.assets[0].uri, name: result.assets[0].name });
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const result = await run({ uri: file.uri, password, clientSecret });
      if (result.ok) onDone();
      else if (result.kind === "credentials") setError({ message: result.error.message, helpUrl: result.error.helpUrl });
      else setError({ message: result.message });
    } catch {
      setError({ message: "Não foi possível restaurar o backup. Tente de novo." });
    } finally {
      setBusy(false);
    }
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
  const label = { fontFamily: font.medium, color: c.ink2, marginTop: 16, marginBottom: 6 } as const;

  return (
    <Screen
      title="Restaurar backup"
      sub="Volte ao que você tinha. A restauração substitui tudo o que há neste celular."
      footer={
        <>
          <Button label={busy ? "Restaurando…" : "Restaurar"} disabled={busy || !file || !password || !clientSecret} onPress={submit} />
          {onCancel ? <Button label="Voltar" secondary onPress={onCancel} disabled={busy} /> : null}
        </>
      }
    >
      <Text style={{ fontFamily: font.medium, color: c.ink2, marginBottom: 6 }}>Arquivo do backup</Text>
      <Button label={file ? file.name : "Escolher arquivo"} secondary onPress={pick} disabled={busy} />
      <Text style={label}>Senha do backup</Text>
      <TextInput style={input} value={password} onChangeText={setPassword} placeholder="A senha que você criou" placeholderTextColor={c.ink2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Text style={label}>Client Secret</Text>
      <TextInput style={input} value={clientSecret} onChangeText={setClientSecret} placeholder="Cole aqui" placeholderTextColor={c.ink2} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <View style={{ marginTop: 12 }}>
        <Fine>O Client ID já vem no backup. Perdeu o Client Secret? Gere um novo no Dashboard da Pluggy.</Fine>
      </View>
      {error ? (
        <View style={{ marginTop: 20, gap: 6 }}>
          <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>{error.message}</Text>
          {error.helpUrl ? <LinkText onPress={() => Linking.openURL(error.helpUrl!)}>Ver em Problemas comuns</LinkText> : null}
        </View>
      ) : null}
    </Screen>
  );
}
