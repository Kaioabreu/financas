import { View } from "react-native";

export type TabIconName = "resumo" | "gastos" | "transacoes" | "patrimonio";

const SIZE = 22;
const SW = 1.5;

/** Thin line icons from the telas-v1 prototype, drawn with Views (no SVG library in the project). */
export function TabIcon({ name, color }: { name: TabIconName; color: string }) {
  const line = { position: "absolute" as const, backgroundColor: color };
  const box = { width: SIZE, height: SIZE };
  switch (name) {
    case "resumo": // banknote
      return (
        <View style={box}>
          <View style={{ position: "absolute", left: 1, top: 5, width: 20, height: 12, borderRadius: 2, borderWidth: SW, borderColor: color }} />
          <View style={{ position: "absolute", left: 8, top: 8, width: 6, height: 6, borderRadius: 3, borderWidth: SW, borderColor: color }} />
        </View>
      );
    case "gastos": // pie: circle with a slice cut out
      return (
        <View style={box}>
          <View style={{ position: "absolute", left: 2, top: 2, width: 18, height: 18, borderRadius: 9, borderWidth: SW, borderColor: color }} />
          <View style={{ ...line, left: 10.25, top: 2, width: SW, height: 9 }} />
          <View style={{ ...line, left: 10.25, top: 10.25, width: 9, height: SW }} />
        </View>
      );
    case "transacoes": // bulleted list
      return (
        <View style={box}>
          {[5, 10.25, 15.5].map((top) => (
            <View key={top}>
              <View style={{ ...line, left: 2, top: top - 0.25, width: 2.5, height: 2.5, borderRadius: 1.25 }} />
              <View style={{ ...line, left: 8, top, width: 12, height: SW }} />
            </View>
          ))}
        </View>
      );
    case "patrimonio": // columns and a base
      return (
        <View style={box}>
          <View style={{ ...line, left: 2, top: 7, width: 18, height: SW }} />
          {[4, 8.5, 13, 17.5].map((left) => (
            <View key={left} style={{ ...line, left, top: 9, width: SW, height: 8 }} />
          ))}
          <View style={{ ...line, left: 2, top: 18.5, width: 18, height: SW }} />
        </View>
      );
  }
}
