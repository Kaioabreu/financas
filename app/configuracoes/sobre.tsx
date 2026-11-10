import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Alert, Pressable } from "react-native";
import { formatUpdateLine, registerTap, type TapState } from "../../src/core/canary";
import { currentChannel, otaDate, toggleChannel } from "../../src/shell/ota";
import { SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";
import { Fine } from "../../src/shell/theme";

export default function Sobre() {
  const router = useRouter();
  const [channel, setChannel] = useState<string | null>(currentChannel);
  const taps = useRef<TapState>({ count: 0, lastAt: 0 });

  async function onVersionTap() {
    const { state, toggled } = registerTap(taps.current, Date.now());
    taps.current = state;
    if (!toggled) return;
    const result = await toggleChannel(channel);
    if (!result.supported) {
      Alert.alert("Canal de atualizações", "Indisponível nesta versão (sem atualizações OTA).");
      return;
    }
    setChannel(result.channel);
    Alert.alert("Canal de atualizações", `Canal ${result.channel}. Vale a partir da próxima abertura do app.`);
  }

  return (
    <SettingsScreen title="Sobre">
      <Pressable onPress={onVersionTap} accessibilityRole="text">
        <Fine>{formatUpdateLine(Constants.expoConfig?.version ?? "?", otaDate, channel)}</Fine>
      </Pressable>
      <SettingsRow label="Créditos" onPress={() => router.push("/configuracoes/creditos")} />
      <SettingsRow label="Código aberto" onPress={() => router.push("/configuracoes/codigo-aberto")} />
    </SettingsScreen>
  );
}
