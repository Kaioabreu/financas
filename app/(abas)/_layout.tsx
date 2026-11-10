import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon, type TabIconName } from "../../src/shell/TabIcon";
import { tabBarMetrics } from "../../src/shell/tabBar";
import { MonthProvider } from "../../src/shell/month";
import { font, usePalette } from "../../src/shell/theme";

export default function AbasLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const bar = tabBarMetrics(insets.bottom);
  const icon = (name: TabIconName) => ({ focused }: { focused: boolean }) => <TabIcon name={name} color={focused ? c.ink : c.ink2} />;
  return (
    <MonthProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: c.ink,
          tabBarInactiveTintColor: c.ink2,
          tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.rule, height: bar.height, paddingTop: 8, paddingBottom: bar.paddingBottom },
          tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        }}
      >
        <Tabs.Screen name="resumo" options={{ title: "Resumo", tabBarIcon: icon("resumo") }} />
        <Tabs.Screen name="gastos" options={{ title: "Gastos", tabBarIcon: icon("gastos") }} />
        <Tabs.Screen name="transacoes" options={{ title: "Transações", tabBarIcon: icon("transacoes") }} />
        <Tabs.Screen name="patrimonio" options={{ title: "Patrimônio", tabBarIcon: icon("patrimonio") }} />
      </Tabs>
    </MonthProvider>
  );
}
