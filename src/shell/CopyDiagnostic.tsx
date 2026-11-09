import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { LinkText } from "./theme";
import { useCore } from "./appCore";

/** "Copiar diagnóstico": puts the allow-listed diagnostic text on the clipboard. */
export function CopyDiagnostic() {
  const core = useCore();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await Clipboard.setStringAsync(await core.diagnostic());
    setCopied(true);
  }
  return <LinkText onPress={copy}>{copied ? "Diagnóstico copiado" : "Copiar diagnóstico"}</LinkText>;
}
