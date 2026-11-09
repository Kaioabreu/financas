import { useRouter } from "expo-router";
import { ScrollView } from "react-native";
import { SectionLabel, SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";

export default function Configuracoes() {
  const router = useRouter();
  return (
    <SettingsScreen title="Configurações">
      <ScrollView>
        <SectionLabel>Pluggy</SectionLabel>
        <SettingsRow label="Credenciais" onPress={() => router.push("/configuracoes/credenciais")} />
        <SectionLabel>Transações</SectionLabel>
        <SettingsRow label="Regras" onPress={() => router.push("/regras")} />
        <SectionLabel>Aparência</SectionLabel>
        <SettingsRow label="Tema" onPress={() => router.push("/configuracoes/aparencia")} />
        <SectionLabel>Ajuda</SectionLabel>
        <SettingsRow label="Guia e Problemas comuns" onPress={() => router.push("/configuracoes/ajuda")} />
        <SectionLabel>Sobre</SectionLabel>
        <SettingsRow label="Versão, Créditos e Código aberto" onPress={() => router.push("/configuracoes/sobre")} />
      </ScrollView>
    </SettingsScreen>
  );
}
