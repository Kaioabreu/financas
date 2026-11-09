import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Linking, Text, View } from "react-native";
import { embeddedConfig } from "../src/core/config";
import type { ConnectError } from "../src/core/connections";
import { CopyDiagnostic } from "../src/shell/CopyDiagnostic";
import { useCore } from "../src/shell/appCore";
import { Body, Button, font, LinkText, Screen, usePalette } from "../src/shell/theme";

type Phase =
  | { name: "intro" }
  | { name: "waiting" }
  | { name: "unfinished" }
  | { name: "error"; error: ConnectError };

export default function Conectar() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [phase, setPhase] = useState<Phase>({ name: "intro" });

  async function open() {
    setPhase({ name: "waiting" });
    const started = await core.startConnect();
    if (!started.ok) return setPhase({ name: "error", error: started.error });
    // The tab promise resolves when the tab closes (abandoned, or finished and dismissed).
    const tabClosed = WebBrowser.openBrowserAsync(started.authUrl).then(() => undefined);
    const result = await core.finishConnect(started.itemId, { tabClosed });
    if (!result.ok) return setPhase({ name: "unfinished" });
    void core.readConnection(started.itemId);
    router.replace("/");
  }

  const later = <Button label="Agora não" secondary onPress={() => router.back()} />;

  if (phase.name === "intro")
    return (
      <Screen
        title="Conectar um banco"
        footer={
          <>
            <Button label="Abrir o Meu Pluggy" onPress={open} />
            <Button label="Depois" secondary onPress={() => router.back()} />
          </>
        }
      >
        <Body>Vai abrir o Meu Pluggy. Escolha um banco; os outros você conecta depois, um de cada vez.</Body>
      </Screen>
    );

  if (phase.name === "waiting")
    return (
      <Screen title="Esperando o Meu Pluggy" sub="Faça o login do banco na aba que abriu. O app acompanha daqui.">
        <ActivityIndicator color={c.acc} style={{ alignSelf: "flex-start", marginTop: 8 }} />
      </Screen>
    );

  if (phase.name === "error") {
    const { error } = phase;
    return (
      <Screen
        title="Não deu para conectar"
        footer={
          <>
            <Button label="Tentar de novo" onPress={open} />
            {later}
          </>
        }
      >
        <Text style={{ fontFamily: font.medium, color: c.neg, fontSize: 15 }}>{error.message}</Text>
        <View style={{ marginTop: 12 }}>
          <LinkText onPress={() => Linking.openURL(error.helpUrl)}>Ver em Problemas comuns</LinkText>
          <CopyDiagnostic />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="O login não terminou"
      sub="O Meu Pluggy não recebeu a autorização. Nada foi conectado."
      footer={
        <>
          <Button label="Tentar de novo" onPress={open} />
          {later}
        </>
      }
    >
      <LinkText onPress={() => Linking.openURL(`${embeddedConfig.guideUrl}#login-que-nao-terminou`)}>Problemas comuns</LinkText>
      <View style={{ marginTop: 12 }}>
        <CopyDiagnostic />
      </View>
    </Screen>
  );
}
