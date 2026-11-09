import { Tabs } from "expo-router";
import { MonthProvider } from "../../src/shell/month";
import { font, usePalette } from "../../src/shell/theme";

export default function AbasLayout() {
  const c = usePalette();
  return (
    <MonthProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.ink,
          tabBarInactiveTintColor: c.ink2,
          tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.rule },
          tabBarLabelStyle: { fontFamily: font.medium, fontSize: 13 },
          tabBarIcon: () => null,
        }}
      >
        <Tabs.Screen name="resumo" options={{ title: "Resumo" }} />
        <Tabs.Screen name="gastos" options={{ title: "Gastos" }} />
        <Tabs.Screen name="transacoes" options={{ title: "Transações" }} />
        <Tabs.Screen name="patrimonio" options={{ title: "Patrimônio" }} />
      </Tabs>
    </MonthProvider>
  );
}
