import { useRouter } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import { ScrollView, View } from "react-native";
import { useCore } from "../../src/shell/appCore";
import { usePalette } from "../../src/shell/theme";
import { SectionLabel, SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";

export default function Configuracoes() {
  const router = useRouter();
  const core = useCore();
  const c = usePalette();
  /** Apagar tudo asks for the lock first (when the phone has one). */
  async function askLock() {
    const { available } = await core.lock.settings();
    if (available) {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirme para apagar tudo", disableDeviceFallback: false });
      if (!result.success) return;
    }
    router.push("/configuracoes/apagar-tudo");
  }
  return (
    <SettingsScreen title="Configurações">
      <ScrollView>
        <SectionLabel>Pluggy</SectionLabel>
        <SettingsRow label="Credenciais" onPress={() => router.push("/configuracoes/credenciais")} />
        <SectionLabel>Transações</SectionLabel>
        <SettingsRow label="Regras" onPress={() => router.push("/regras")} />
        <SectionLabel>Segurança</SectionLabel>
        <SettingsRow label="Bloqueio" onPress={() => router.push("/configuracoes/seguranca")} />
        <SectionLabel>Aparência</SectionLabel>
        <SettingsRow label="Tema" onPress={() => router.push("/configuracoes/aparencia")} />
        <SectionLabel>Ajuda</SectionLabel>
        <SettingsRow label="Guia e Problemas comuns" onPress={() => router.push("/configuracoes/ajuda")} />
        <SectionLabel>Sobre</SectionLabel>
        <SettingsRow label="Versão, Créditos e Código aberto" onPress={() => router.push("/configuracoes/sobre")} />
        <View style={{ marginTop: 32, borderTopWidth: 1, borderTopColor: c.rule }}>
          <SettingsRow label="Apagar tudo" danger onPress={askLock} />
        </View>
      </ScrollView>
    </SettingsScreen>
  );
}
