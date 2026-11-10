import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, useColorScheme, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Palette from prototype/telas-fora-das-abas (variant B, Jost): pure white or pure black.
const light = { bg: "#FFFFFF", ink: "#111418", ink2: "#5E6670", rule: "#E7E9EC", track: "#F0F2F4", acc: "#2D62B0", neg: "#B8325A" };
const dark = { bg: "#000000", ink: "#F2F3F5", ink2: "#9AA1AA", rule: "#202328", track: "#16181B", acc: "#6E9BE6", neg: "#E0577F" };
export type Palette = typeof light;

export const font = { regular: "Jost_400Regular", medium: "Jost_500Medium", semibold: "Jost_600SemiBold" };

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export function Screen({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 24 }}>
      <View style={{ flex: 1, paddingHorizontal: 24 }}>
        <Text style={[s.title, { color: c.ink }]}>{title}</Text>
        {sub ? <Text style={[s.body, { color: c.ink2, marginTop: 6 }]}>{sub}</Text> : null}
        <View style={{ marginTop: 20, flex: 1 }}>{children}</View>
      </View>
      {footer ? <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, gap: 10 }}>{footer}</View> : null}
    </View>
  );
}

export function Body({ children, style }: { children: ReactNode; style?: object }) {
  const c = usePalette();
  return <Text style={[s.body, { color: c.ink }, style]}>{children}</Text>;
}

export function Fine({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[s.fine, { color: c.ink2 }]}>{children}</Text>;
}

export function LinkText({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      <Text style={[s.fine, { color: c.acc, textDecorationLine: "underline" }]}>{children}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  const c = usePalette();
  const style: ViewStyle = secondary
    ? { backgroundColor: c.track }
    : { backgroundColor: c.ink, opacity: disabled ? 0.5 : 1 };
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[s.btn, style]}>
      <Text style={[s.btnText, { color: secondary ? c.ink : c.bg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: font.semibold, fontSize: 28 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  fine: { fontFamily: font.regular, fontSize: 13.5, lineHeight: 19 },
  btn: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center" },
  btnText: { fontFamily: font.medium, fontSize: 15.5 },
});
