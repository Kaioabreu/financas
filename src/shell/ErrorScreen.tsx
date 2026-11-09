import * as Clipboard from "expo-clipboard";
import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { copyableDiagnostic } from "../core/errorDiagnostic";
import { currentCore } from "./appCore";
import { Button, font, Screen, usePalette } from "./theme";

/** Unhandled error: shows exactly the text that is copied. The message and the stack never leave the app (they can carry SQL and values). */
export function ErrorScreen({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  const c = usePalette();
  const [diagnostic, setDiagnostic] = useState("Diagnóstico indisponível (o app ainda não tinha aberto o banco).");
  const [copied, setCopied] = useState(false);
  const copyable = () => copyableDiagnostic(diagnostic, error);

  useEffect(() => {
    currentCore?.diagnostic().then(setDiagnostic, () => undefined);
  }, []);

  return (
    <Screen
      title="Algo deu errado"
      sub="Copie o diagnóstico e mande para quem mantém o app."
      footer={
        <>
          <Button
            label={copied ? "Diagnóstico copiado" : "Copiar diagnóstico"}
            onPress={async () => {
              await Clipboard.setStringAsync(copyable());
              setCopied(true);
            }}
          />
          <Button label="Tentar de novo" secondary onPress={() => void retry()} />
        </>
      }
    >
      <ScrollView>
        <Text selectable style={{ fontFamily: font.regular, color: c.ink, fontSize: 13 }}>
          {copyable()}
        </Text>
      </ScrollView>
    </Screen>
  );
}
