import { useState } from "react";
import { Text } from "react-native";
import type { Core } from "../core/createCore";
import { refuseInspection, type RestoreInput, type RestoreResult } from "../core/restore";
import { createAppCore } from "./appCore";
import { restoreFilePort } from "./backupFile";
import { eraseLocalData, openAppVault } from "./openDatabase";
import { RestoreForm } from "./RestoreForm";
import { Body, Button, font, Screen, usePalette } from "./theme";

/** Opens the (new, empty) database after the unreadable file was erased, and makes the core over it. */
async function openFresh(): Promise<Core> {
  const vault = await openAppVault();
  return createAppCore(vault.orm);
}

/**
 * The database file exists but the key does not open it. Explains it and lets the user choose;
 * nothing is erased before the choice.
 */
export function UnreadableDatabase({ onOpen }: { onOpen: (core: Core) => void }) {
  const c = usePalette();
  const [mode, setMode] = useState<"choose" | "restore" | "confirm-erase">("choose");
  const [fresh, setFresh] = useState<Core | null>(null);
  const [busy, setBusy] = useState(false);

  async function startOver() {
    setBusy(true);
    await eraseLocalData();
    onOpen(await openFresh());
  }

  async function restore(input: RestoreInput): Promise<RestoreResult> {
    let core = fresh;
    if (!core) {
      // Check the file first, so a wrong password leaves the unreadable file where it is.
      const inspection = await restoreFilePort.inspect(input.uri, input.password);
      const refusal = refuseInspection(inspection, restoreFilePort.appMigrations);
      if (refusal) return refusal;
      await eraseLocalData();
      core = await openFresh();
      setFresh(core);
    }
    const result = await core.restoreBackup(input);
    if (result.ok) onOpen(core);
    return result;
  }

  if (mode === "restore") return <RestoreForm run={restore} onDone={() => undefined} onCancel={fresh ? undefined : () => setMode("choose")} />;

  if (mode === "confirm-erase") {
    return (
      <Screen
        title="Começar do zero?"
        sub="O arquivo que o app não consegue abrir será apagado."
        footer={
          <>
            <Button label={busy ? "Apagando…" : "Apagar e começar do zero"} disabled={busy} onPress={startOver} />
            <Button label="Voltar" secondary disabled={busy} onPress={() => setMode("choose")} />
          </>
        }
      >
        <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.neg }}>Isto não tem volta</Text>
        <Body>Os dados que estavam nele só voltam se você tiver um backup.</Body>
      </Screen>
    );
  }

  return (
    <Screen
      title="Não foi possível abrir seus dados"
      sub="Os dados deste celular estão cifrados, e a chave guardada no aparelho não consegue abri-los."
      footer={
        <>
          <Button label="Restaurar backup" onPress={() => setMode("restore")} />
          <Button label="Começar do zero" secondary onPress={() => setMode("confirm-erase")} />
        </>
      }
    >
      <Body>Isso pode acontecer quando o aparelho perde a chave, por exemplo depois de restaurar o celular a partir de uma cópia do sistema.</Body>
      <Body style={{ marginTop: 12 }}>O app não apaga nada sozinho. Escolha: restaurar um backup (que substitui o arquivo) ou começar do zero (que o apaga).</Body>
    </Screen>
  );
}
