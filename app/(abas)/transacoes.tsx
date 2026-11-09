import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AccountSummary, ConnectionSummary, TransactionRow } from "../../src/core/connections";
import { useCore } from "../../src/shell/appCore";
import { monthLabel, shiftMonth, useMonth } from "../../src/shell/month";
import { useRouter } from "expo-router";
import type { CpfStatus } from "../../src/core/classification";
import { categoryLabel, natureLabel, originLabel } from "../../src/shell/labels";
import { Body, Fine, font, LinkText, usePalette } from "../../src/shell/theme";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Transacoes() {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { month, setMonth } = useMonth();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cpf, setCpf] = useState<CpfStatus | null>(null);
  const router = useRouter();

  const refresh = async () => {
    setRefreshing(true);
    try {
      const report = await core.sync({ manual: true });
      setNotice(report.notices.map((n) => n.message).join(", ") || null);
    } finally {
      setRefreshing(false);
    }
  };

  // The tab fills in as the first read advances: reload every few seconds.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await core.listAccounts();
      if (!alive) return;
      setAccounts(list);
      setConnections(await core.listConnections());
      setCpf(await core.cpfStatus());
      const id = selected ?? list[0]?.id ?? null;
      if (id !== selected) setSelected(id);
      if (id) {
        const found = await core.listTransactions({ accountId: id, month });
        if (alive) setRows(found);
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [core, month, selected]);

  const itemId = accounts.find((a) => a.id === selected)?.itemId;
  const dataAtIso = connections.find((x) => x.itemId === itemId)?.dataAt;
  const dataAt = dataAtIso ? dataAtIso.slice(0, 10).split("-").reverse().join("/") : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 }}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12} accessibilityLabel="Mês anterior">
          <Text style={{ fontFamily: font.medium, fontSize: 22, color: c.ink }}>‹</Text>
        </Pressable>
        <Text style={{ fontFamily: font.semibold, fontSize: 18, color: c.ink }}>{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={12} accessibilityLabel="Próximo mês">
          <Text style={{ fontFamily: font.medium, fontSize: 22, color: c.ink }}>›</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginTop: 16 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 20 }}
      >
        {accounts.map((a) => (
          <Pressable key={a.id} onPress={() => setSelected(a.id)} hitSlop={8}>
            <Text
              style={{
                fontFamily: a.id === selected ? font.semibold : font.regular,
                color: a.id === selected ? c.ink : c.ink2,
                fontSize: 15.5,
                textDecorationLine: a.id === selected ? "underline" : "none",
              }}
            >
              {a.kind === "card" ? `Cartão · ${a.name}` : a.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {dataAt ? <View style={{ paddingHorizontal: 24, marginTop: 8 }}><Fine>Dados de {dataAt}</Fine></View> : null}
      {notice ? <View style={{ paddingHorizontal: 24, marginTop: 4 }}><Fine>{notice}</Fine></View> : null}
      {cpf?.state === "needed" && accounts.length ? (
        <View style={{ paddingHorizontal: 24, marginTop: 4 }}>
          <LinkText onPress={() => router.push("/cpf")}>Informe o seu CPF para reconhecer as transferências entre as suas contas</LinkText>
        </View>
      ) : null}
      <FlatList
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        style={{ marginTop: 12 }}
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={
          <Body style={{ color: c.ink2, marginTop: 12 }}>
            {accounts.length ? "Nenhuma transação neste mês." : "Lendo os dados do banco…"}
          </Body>
        }
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: c.rule,
            }}
          >
            <View style={{ flex: 1 }}>
              <Body>{item.description}</Body>
              <Fine>
                {item.date.split("-").reverse().join("/")} · {natureLabel[item.nature]}
                {item.category ? ` · ${categoryLabel[item.category].icon} ${categoryLabel[item.category].name}` : ""}
                {item.origin ? ` · ${originLabel[item.origin]}` : ""}
              </Fine>
            </View>
            <Text style={{ fontFamily: font.medium, fontSize: 16, color: item.amount < 0 ? c.ink : c.acc }}>
              {brl.format(item.amount)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}
