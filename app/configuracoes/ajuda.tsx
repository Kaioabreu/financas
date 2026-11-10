import { Linking, View } from "react-native";
import { embeddedConfig } from "../../src/core/config";
import { CopyDiagnostic } from "../../src/shell/CopyDiagnostic";
import { SettingsRow, SettingsScreen } from "../../src/shell/SettingsScreen";

export default function Ajuda() {
  return (
    <SettingsScreen title="Ajuda">
      <SettingsRow label="Guia" onPress={() => Linking.openURL(embeddedConfig.guideUrl)} />
      <SettingsRow label="Problemas comuns" onPress={() => Linking.openURL(`${embeddedConfig.guideUrl}#problemas-comuns`)} />
      <View style={{ marginTop: 18 }}>
        <CopyDiagnostic />
      </View>
    </SettingsScreen>
  );
}
