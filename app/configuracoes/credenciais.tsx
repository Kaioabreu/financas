import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { useCore } from "../../src/shell/appCore";
import { SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";
import { Fine, font, usePalette } from "../../src/shell/theme";

export default function Credenciais() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [clientId, setClientId] = useState<string | null>(null);
  useEffect(() => {
    void core.credentialsStatus().then((s) => setClientId(s.saved ? s.clientId : null));
  }, [core]);
  return (
    <SettingsScreen title="Credenciais" sub="Da aplicação que você criou no Dashboard da Pluggy.">
      <Fine>Client ID</Fine>
      <Text selectable style={{ fontFamily: font.medium, fontSize: 15, color: c.ink, marginBottom: 12 }}>{clientId ?? "—"}</Text>
      <SettingsRow label="Atualizar Client Secret" onPress={() => router.push("/atualizar-secret")} />
      <SettingsRow label="Trocar de aplicação" onPress={() => router.push("/configuracoes/trocar-aplicacao")} />
    </SettingsScreen>
  );
}
