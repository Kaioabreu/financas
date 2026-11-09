import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { ConnectionSummary } from "../src/core/connections";
import { useCore } from "../src/shell/appCore";
import { Body, Button, Fine, font, Screen, usePalette } from "../src/shell/theme";

const MAX_BANKS = 5;

export default function Entry() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);

  useEffect(() => {
    core.credentialsStatus().then((s) => setSaved(s.saved));
  }, [core]);

  useEffect(() => {
    if (!saved) return;
    void core.resumeReads().then(() => core.sync({ manual: false }));
    const load = () => core.listConnections().then(setConnections);
    void load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [core, saved]);

  if (saved === null) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  // Leaving before saving brings the user back to the Boas-vindas, with nothing stored.
  if (!saved) return <Redirect href="/boas-vindas" />;

  const hasAny = connections.length > 0;
  return (
    <Screen
      title={hasAny ? "Conexões" : "Conecte um banco"}
      sub={hasAny ? undefined : "Seus dados aparecem aqui depois da primeira leitura."}
      footer={
        <>
          {hasAny ? <Button label="Ver meus dados" onPress={() => router.push("/resumo")} /> : null}
          <Button
            label={hasAny ? `Conectar outro banco · ${connections.length} de ${MAX_BANKS}` : "Conectar um banco"}
            secondary={hasAny}
            onPress={() => router.push("/conectar")}
          />
        </>
      }
    >
      {connections.map((conn) => (
        <View key={conn.itemId} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.rule }}>
          <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.ink }}>{conn.bankName}</Text>
          <Fine>
            {conn.readState === "reading" ? "Lendo…" : conn.readState === "failed" ? "A leitura não terminou" : "Em dia"}
          </Fine>
        </View>
      ))}
      {hasAny ? null : <Body>Nenhuma Conexão ainda.</Body>}
    </Screen>
  );
}
