import { useRouter } from "expo-router";
import { Linking, ScrollView, Text, View } from "react-native";
import { embeddedConfig } from "../src/core/config";
import { Body, Button, font, Screen, usePalette } from "../src/shell/theme";

const needs = [
  "Uma conta no Meu Pluggy, com os seus bancos conectados.",
  "Uma aplicação no Dashboard da Pluggy, com as credenciais dela.",
];
const goodToKnow = [
  "Os dados ficam só neste celular, e ninguém mais os vê.",
  "O app atualiza 1 vez por dia. Um gasto pode levar uns 2 dias para aparecer.",
  "Até 5 bancos, todos no seu nome.",
  "Sem Backup, perder o celular é perder o histórico.",
];

export default function AntesDeComecar() {
  const router = useRouter();
  const c = usePalette();
  return (
    <Screen
      title="Antes de começar"
      footer={
        <>
          <Button label="Já tenho" onPress={() => router.push("/credenciais")} />
          <Button label="Ver o guia" secondary onPress={() => Linking.openURL(embeddedConfig.guideUrl)} />
        </>
      }
    >
      <ScrollView>
        <Body>Você vai precisar de:</Body>
        {needs.map((t, i) => (
          <View key={t} style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
            <Text style={{ fontFamily: font.semibold, color: c.acc, fontSize: 16 }}>{i + 1}</Text>
            <Body style={{ flex: 1 }}>{t}</Body>
          </View>
        ))}
        <Text style={{ fontFamily: font.semibold, color: c.ink2, marginTop: 28, marginBottom: 4, fontSize: 13, letterSpacing: 0.6 }}>
          BOM SABER
        </Text>
        {goodToKnow.map((t) => (
          <View key={t} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.rule }}>
            <Body>{t}</Body>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
