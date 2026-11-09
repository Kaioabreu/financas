import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { useCore } from "../../src/shell/appCore";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { Body, Button, Fine, font, usePalette } from "../../src/shell/theme";

export default function TrocarAplicacao() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    await core.switchApplication();
    // Back to the credentials entry, starting from scratch with the rules and edits kept.
    router.dismissAll();
    router.replace("/credenciais");
  }

  return (
    <SettingsScreen
      title="Trocar de aplicação?"
      sub="Você vai começar de novo com outro Client ID."
      footer={<Button label={busy ? "Apagando…" : "Apagar e trocar"} disabled={busy} onPress={confirm} />}
    >
      <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.neg }}>Vai sumir</Text>
      <Body>As Conexões e os dados baixados: contas, cartões, transações, faturas, investimentos e o histórico do patrimônio.</Body>
      <View style={{ marginTop: 18 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.ink }}>Fica</Text>
        <Body>As suas regras e as classificações que você fez à mão.</Body>
      </View>
      <View style={{ marginTop: 18 }}>
        <Fine>Os itens já criados na aplicação antiga continuam lá; apague-os no Dashboard se quiser.</Fine>
      </View>
    </SettingsScreen>
  );
}
