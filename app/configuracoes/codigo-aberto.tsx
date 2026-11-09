import { Linking } from "react-native";
import { SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";
import { Body } from "../../src/shell/theme";

const REPO = "https://github.com/Kaioabreu/financas";

export default function CodigoAberto() {
  return (
    <SettingsScreen title="Código aberto">
      <Body>O código do app é aberto, sob a licença MIT.</Body>
      <SettingsRow label="Repositório" onPress={() => Linking.openURL(REPO)} />
      <SettingsRow label="Licença MIT" onPress={() => Linking.openURL(`${REPO}/blob/main/LICENSE`)} />
    </SettingsScreen>
  );
}
