import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { openAppVault } from "../src/shell/openDatabase";

type State = { status: "opening" } | { status: "open"; cipherVersion: string } | { status: "failed"; message: string };

export default function RootLayout() {
  const [state, setState] = useState<State>({ status: "opening" });

  useEffect(() => {
    openAppVault().then(
      (vault) => setState({ status: "open", cipherVersion: vault.cipherVersion }),
      (error: unknown) =>
        setState({ status: "failed", message: error instanceof Error ? error.message : String(error) }),
    );
  }, []);

  if (state.status === "opening") {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state.status === "failed") {
    // Fail closed: no database, no app.
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Não foi possível abrir o banco cifrado</Text>
        <Text>{state.message}</Text>
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "600" },
});
