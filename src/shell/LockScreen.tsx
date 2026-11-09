import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import type { Core } from "../core/createCore";
import { Button, Fine, font, usePalette } from "./theme";

/**
 * Covers the app (without unmounting it, so the database opens and the sync runs behind it)
 * whenever the lock policy says so. Biometric first, the device PIN as the fallback.
 * No FLAG_SECURE: screenshots stay allowed.
 */
export function LockScreen({ core }: { core: Core }) {
  const c = usePalette();
  const [covered, setCovered] = useState(true);
  const prompting = useRef(false);

  const prompt = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (!(await core.lock.mustPrompt())) return setCovered(false);
      setCovered(true);
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Desbloquear o Finanças",
        disableDeviceFallback: false,
      });
      if (result.success) {
        core.lock.unlock();
        setCovered(false);
      }
    } finally {
      prompting.current = false;
    }
  }, [core]);

  useEffect(() => {
    void prompt();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        core.lock.appForegrounded();
        void prompt();
      } else if (next === "background") {
        core.lock.appBackgrounded();
      }
    });
    return () => sub.remove();
  }, [core, prompt]);

  if (!covered) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.bg }]}>
      <Text style={{ fontSize: 44 }}>🔒</Text>
      <Text style={{ fontFamily: font.semibold, fontSize: 20, color: c.ink }}>Finanças</Text>
      <Fine>Atualizando seus dados por trás…</Fine>
      <Button label="Desbloquear" onPress={() => void prompt()} />
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: "center", justifyContent: "center", padding: 24, gap: 12 } });
