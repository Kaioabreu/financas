import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";
import { Fine } from "../../src/shell/theme";

function updateDate(): string {
  const created = Constants.manifest2?.createdAt;
  if (!created) return "versão embutida, sem atualização";
  const d = new Date(created);
  return `atualizado em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export default function Sobre() {
  const router = useRouter();
  return (
    <SettingsScreen title="Sobre">
      <Fine>{`Versão ${Constants.expoConfig?.version ?? "?"} · ${updateDate()}`}</Fine>
      <SettingsRow label="Créditos" onPress={() => router.push("/configuracoes/creditos")} />
      <SettingsRow label="Código aberto" onPress={() => router.push("/configuracoes/codigo-aberto")} />
    </SettingsScreen>
  );
}
