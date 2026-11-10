import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import type { ConnectionSummary } from "../src/core/connections";
import { useLiveData } from "../src/shell/useLiveData";
import { useCore } from "../src/shell/appCore";
import { Body, Button, Screen, usePalette } from "../src/shell/theme";

export default function Entry() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[] | null>(null);

  useEffect(() => {
    core.credentialsStatus().then((s) => setSaved(s.saved));
  }, [core]);

  useEffect(() => {
    if (!saved) return;
    void core.resumeReads().then(() => core.sync({ manual: false }));
  }, [core, saved]);

  useLiveData(async (alive) => {
    if (!saved) return;
    const list = await core.listConnections();
    if (alive()) setConnections(list);
  }, [saved]);

  if (saved === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  // Leaving before saving brings the user back to the Boas-vindas, with nothing stored.
  if (!saved) return <Redirect href="/boas-vindas" />;
  // Connections still loading: keep the blank screen so the first frame never flashes the wrong one.
  if (connections === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  // With at least one Connection the app opens straight on Resumo; Conexões lives in Configurações.
  if (connections.length > 0) return <Redirect href="/resumo" />;

  // Only the first time (or after every bank was removed) reaches here.
  return (
    <Screen
      title="Conecte um banco"
      sub="Seus dados aparecem aqui depois da primeira leitura."
      footer={<Button label="Conectar um banco" onPress={() => router.push("/conectar")} />}
    >
      <Body>Nenhuma Conexão ainda.</Body>
    </Screen>
  );
}
