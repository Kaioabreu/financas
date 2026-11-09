import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { useCore } from "../../src/shell/appCore";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { Fine, font, usePalette } from "../../src/shell/theme";

export default function Seguranca() {
  const core = useCore();
  const c = usePalette();
  const [state, setState] = useState<{ enabled: boolean; available: boolean } | null>(null);
  useEffect(() => {
    void core.lock.settings().then(setState);
  }, [core]);
  async function toggle(enabled: boolean) {
    setState((s) => (s ? { ...s, enabled } : s));
    await core.lock.setEnabled(enabled);
  }
  const available = state?.available ?? false;
  return (
    <SettingsScreen title="Segurança">
      <View style={{ paddingVertical: 15, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.ink }}>Bloqueio</Text>
          <Fine>
            {available ? "Pede a biometria (ou o PIN do celular) ao abrir e ao voltar depois de 1 min." : "Seu celular não tem bloqueio de tela"}
          </Fine>
        </View>
        <Switch value={available && (state?.enabled ?? false)} disabled={!available} onValueChange={toggle} />
      </View>
    </SettingsScreen>
  );
}
