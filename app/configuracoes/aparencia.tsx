import { useEffect, useState } from "react";
import { Appearance as RNAppearance, Pressable, Text } from "react-native";
import type { Appearance } from "../../src/core/createCore";
import { useCore } from "../../src/shell/appCore";
import { SettingsScreen } from "../../src/shell/SettingsScreen";
import { font, usePalette } from "../../src/shell/theme";

const OPTIONS: { value: Appearance; label: string }[] = [
  { value: "system", label: "Do sistema" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

export default function Aparencia() {
  const core = useCore();
  const c = usePalette();
  const [value, setValue] = useState<Appearance>("system");
  useEffect(() => {
    void core.appearance().then(setValue);
  }, [core]);
  async function choose(next: Appearance) {
    setValue(next);
    RNAppearance.setColorScheme(next === "system" ? "unspecified" : next);
    await core.setAppearance(next);
  }
  return (
    <SettingsScreen title="Aparência">
      {OPTIONS.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => choose(o.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.value }}
          style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.rule, flexDirection: "row", justifyContent: "space-between" }}
        >
          <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.ink }}>{o.label}</Text>
          <Text style={{ fontSize: 17, color: c.acc }}>{value === o.value ? "●" : "○"}</Text>
        </Pressable>
      ))}
    </SettingsScreen>
  );
}
