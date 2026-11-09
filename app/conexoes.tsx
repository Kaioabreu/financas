import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import type { AccountSummary, ConnectionSummary } from "../src/core/connections";
import { useCore } from "../src/shell/appCore";
import { expiryText, readTime, stateLabel } from "../src/shell/connectionLabels";
import { Body, Button, Fine, font, Screen, usePalette } from "../src/shell/theme";

const LIMIT = 5;

export default function Conexoes() {
  const core = useCore();
  const router = useRouter();
  const c = usePalette();
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConnections(await core.listConnections());
    setAccounts(await core.listAccounts());
  }, [core]);
  useEffect(() => {
    void load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [load]);

  function confirmRemove(conn: ConnectionSummary) {
    Alert.alert(
      `Remover o ${conn.bankName}?`,
      `Apaga a autorização no Meu Pluggy e, deste celular, as contas, as transações e as faturas do ${conn.bankName}. As regras ficam.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            await core.removeConnection(conn.itemId);
            setOpen(null);
            await load();
          },
        },
      ],
    );
  }

  return (
    <Screen
      title="Conexões"
      sub="Cada banco é uma autorização no seu Meu Pluggy."
      footer={<Button label={`Conectar banco · ${connections.length} de ${LIMIT}`} onPress={() => router.push("/conectar")} />}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {connections.length === 0 ? <Body>Nenhum banco ainda.</Body> : null}
        {connections.map((conn) => {
          const label = stateLabel(conn);
          const expanded = open === conn.itemId;
          const names = accounts.filter((a) => a.itemId === conn.itemId).map((a) => a.name);
          const data = conn.dataAt ? readTime(conn.dataAt) : "—";
          return (
            <View key={conn.itemId} style={{ borderBottomWidth: 1, borderBottomColor: c.rule, paddingVertical: 14 }}>
              <Pressable onPress={() => setOpen(expanded ? null : conn.itemId)} accessibilityRole="button">
                <Text style={{ fontFamily: font.semibold, fontSize: 17, color: c.ink }}>{conn.bankName}</Text>
                <Text style={{ fontFamily: font.medium, fontSize: 14, color: label.attention ? c.neg : c.ink2 }}>{label.text}</Text>
                <Fine>Dados de {data}</Fine>
              </Pressable>
              {expanded ? (
                <View style={{ marginTop: 12, gap: 10 }}>
                  {conn.state === "expired" ? (
                    <Fine>A conexão venceu e o app parou de ler este banco. Seus dados continuam aqui; um novo login traz o banco de volta.</Fine>
                  ) : null}
                  {conn.state === "expiring" ? (
                    <Fine>A autorização vence em breve. Renovar é fazer login de novo no Meu Pluggy; os dados já lidos não mudam.</Fine>
                  ) : null}
                  <Fact label="Dados de" value={data} />
                  <Fact label="O que vem" value={names.length ? names.join(", ") : "—"} />
                  <Fact label="Autorização" value={expiryText(conn)} />
                  <Button label="Renovar" secondary={conn.state === "ok" || conn.state === "reading"} onPress={() => router.push("/conectar")} />
                  <Button label="Remover" secondary onPress={() => confirmRemove(conn)} />
                  <Fine>Renovar abre o Meu Pluggy para um novo login e dá mais 1 ano. Os dados já lidos não mudam.</Fine>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  const c = usePalette();
  return (
    <View>
      <Fine>{label}</Fine>
      <Text style={{ fontFamily: font.regular, fontSize: 15, color: c.ink }}>{value}</Text>
    </View>
  );
}
