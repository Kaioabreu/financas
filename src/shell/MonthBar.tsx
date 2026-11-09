import { Pressable, Text, View } from "react-native";
import { monthLabel, shiftMonth, useMonth } from "./month";
import { font, usePalette } from "./theme";

/** The month at the top; it holds for Resumo, Gastos and Transações. */
export function MonthBar() {
  const c = usePalette();
  const { month, setMonth } = useMonth();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 }}>
      <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
        <Text style={{ fontFamily: font.medium, fontSize: 22, color: c.ink }}>‹</Text>
      </Pressable>
      <Text style={{ fontFamily: font.semibold, fontSize: 18, color: c.ink }}>{monthLabel(month)}</Text>
      <Pressable onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
        <Text style={{ fontFamily: font.medium, fontSize: 22, color: c.ink }}>›</Text>
      </Pressable>
    </View>
  );
}
