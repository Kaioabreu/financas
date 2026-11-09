import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useRestart } from "../_layout";
import { useCore } from "../../src/shell/appCore";
import { eraseLocalData } from "../../src/shell/openDatabase";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { Body, Button, Fine, font, Screen, usePalette } from "../../src/shell/theme";

const MY_PLUGGY = "https://meu.pluggy.ai";

export default function ApagarTudo() {
  const core = useCore();
  const router = useRouter();
  const restart = useRestart();
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const [leftover, setLeftover] = useState(false);

  /** Back to the Boas-vindas with a fresh database, as on the first opening. */
  function backToStart() {
    router.dismissAll();
    router.replace("/boas-vindas");
    setTimeout(restart, 150);
  }

  async function confirm() {
    setBusy(true);
    const { failed } = await core.eraseAtPluggy();
    await eraseLocalData();
    if (failed > 0) setLeftover(true);
    else backToStart();
  }

  if (leftover) {
    return (
      <Screen title="Quase tudo apagado" footer={<Button label="Voltar ao início" onPress={backToStart} />}>
        <Body>Tudo saiu do celular, mas o Pluggy não confirmou a remoção das Conexões.</Body>
        <View style={{ marginTop: 18 }}>
          <Body>Remova as autorizações no Meu Pluggy ({MY_PLUGGY}) para encerrar o acesso aos seus bancos.</Body>
        </View>
      </Screen>
    );
  }

  return (
    <SettingsScreen
      title="Apagar tudo?"
      sub="Não dá para desfazer."
      footer={<Button label={busy ? "Apagando…" : "Apagar tudo"} disabled={busy} onPress={confirm} />}
    >
      <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.neg }}>Vai sumir</Text>
      <Body>As Conexões na Pluggy.</Body>
      <Body>Os dados baixados: contas, cartões, transações, faturas, investimentos e o histórico do patrimônio.</Body>
      <Body>As suas regras e as classificações que você fez à mão.</Body>
      <Body>O Client ID e o Client Secret, e o backup temporário, se houver.</Body>
      <View style={{ marginTop: 18 }}>
        <Fine>Depois, o app volta à primeira abertura.</Fine>
      </View>
    </SettingsScreen>
  );
}
