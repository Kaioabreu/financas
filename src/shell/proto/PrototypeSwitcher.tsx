// PROTOTYPE: floating pill `◀ A (name) ▶`. Not gated on __DEV__ on purpose: the APK is a release build.
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, usePalette } from "../theme";

export function PrototypeSwitcher({ names, index, onChange }: { names: string[]; index: number; onChange: (i: number) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const step = (d: number) => onChange((index + d + names.length) % names.length);
  const arrow = { color: c.bg, fontSize: 18, fontFamily: font.medium, paddingHorizontal: 10 } as const;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 12 + Math.min(insets.bottom, 8), alignItems: "center" }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: c.ink,
          borderRadius: 22,
          paddingVertical: 8,
          paddingHorizontal: 6,
          elevation: 6,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
        }}
      >
        <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityLabel="Variante anterior">
          <Text style={arrow}>◀</Text>
        </Pressable>
        <Text style={{ color: c.bg, fontFamily: font.semibold, fontSize: 14.5, minWidth: 150, textAlign: "center" }}>
          {String.fromCharCode(65 + index)} ({names[index]})
        </Text>
        <Pressable onPress={() => step(1)} hitSlop={8} accessibilityLabel="Próxima variante">
          <Text style={arrow}>▶</Text>
        </Pressable>
      </View>
    </View>
  );
}
