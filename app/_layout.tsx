import { Jost_400Regular, Jost_500Medium, Jost_600SemiBold, useFonts } from "@expo-google-fonts/jost";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Appearance, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Core } from "../src/core/createCore";
import { CoreProvider, createAppCore } from "../src/shell/appCore";
import { openAppVault } from "../src/shell/openDatabase";
import { usePalette } from "../src/shell/theme";
import { LockScreen } from "../src/shell/LockScreen";
import { ErrorScreen } from "../src/shell/ErrorScreen";

/** expo-router renders this for any unhandled error below the layout. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return <ErrorScreen error={error} retry={retry} />;
}

type State = { status: "opening" } | { status: "open"; core: Core } | { status: "failed"; message: string };

export default function RootLayout() {
  const [state, setState] = useState<State>({ status: "opening" });
  const [fontsLoaded] = useFonts({ Jost_400Regular, Jost_500Medium, Jost_600SemiBold });
  const c = usePalette();

  useEffect(() => {
    openAppVault().then(
      async (vault) => {
        const core = createAppCore(vault.orm);
        const saved = await core.appearance().catch(() => "system" as const);
        Appearance.setColorScheme(saved === "system" ? "unspecified" : saved);
        setState({ status: "open", core });
      },
      (error: unknown) =>
        setState({ status: "failed", message: error instanceof Error ? error.message : String(error) }),
    );
  }, []);

  if (state.status === "failed") {
    // Fail closed: no database, no app.
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.title, { color: c.ink }]}>Não foi possível abrir o banco cifrado</Text>
        <Text style={{ color: c.ink }}>{state.message}</Text>
      </View>
    );
  }
  if (state.status === "opening" || !fontsLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <SafeAreaProvider>
      <CoreProvider value={state.core}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
        <LockScreen core={state.core} />
      </CoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "600" },
});
