import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Fine, font, Screen, usePalette } from "./theme";

/** A Configurações subscreen: stacks over the previous one and always offers "Voltar". */
export function SettingsScreen({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer?: ReactNode }) {
  const router = useRouter();
  return (
    <Screen
      title={title}
      sub={sub}
      footer={
        <>
          {footer}
          <Button label="Voltar" secondary onPress={() => router.back()} />
        </>
      }
    >
      {children}
    </Screen>
  );
}

/** A tappable line of a settings list. */
export function SettingsRow({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.rule, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
    >
      <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.ink }}>{label}</Text>
      {value ? <Fine>{value}</Fine> : <Text style={{ color: c.ink2, fontSize: 18 }}>›</Text>}
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const c = usePalette();
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.ink2, textTransform: "uppercase", letterSpacing: 0.6 }}>{children}</Text>
    </View>
  );
}
