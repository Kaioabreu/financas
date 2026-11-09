import { useEffect, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BillGap } from "../../src/core/bills";
import { embeddedConfig } from "../../src/core/config";
import type { AccountSummary, ConnectionSummary, TransactionRow } from "../../src/core/connections";
import { useCore } from "../../src/shell/appCore";
import { MonthBar } from "../../src/shell/MonthBar";
import { useMonth } from "../../src/shell/month";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AppCategory, CpfStatus } from "../../src/core/classification";
import { categoryLabel, natureLabel, originLabel } from "../../src/shell/labels";
import { Body, Fine, font, LinkText, usePalette } from "../../src/shell/theme";
import { EditSheet } from "../../src/shell/EditSheet";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function Transacoes() {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { month } = useMonth();
  const params = useLocalSearchParams<{ category?: string; from?: string; to?: string }>();
  const category = params.category as AppCategory | undefined;
  const days = params.from && params.to ? { from: Number(params.from), to: Number(params.to) } : undefined;
  const filtered = Boolean(category || days);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gaps, setGaps] = useState<BillGap[]>([]);
  const [cpf, setCpf] = useState<CpfStatus | null>(null);
  const router = useRouter();
  const [editing, setEditing] = useState<TransactionRow | null>(null);

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
      const card = list.find((a) => a.id === (selected ?? list[0]?.id));
      const found = card?.kind === "card" && !filtered ? await core.billGaps({ month, accountId: card.id }) : [];
      if (alive) setGaps(found);
      const id = selected ?? list[0]?.id ?? null;
      if (id !== selected) setSelected(id);
      // Coming from Gastos, the list covers every account and only what that slice summed.
      if (filtered) {
        const found = await core.listTransactions({ month, category, days });
        if (alive) setRows(found);
      } else if (id) {
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
  }, [core, month, selected, filtered, category, days?.from, days?.to]);

  const dataAt = accounts.find((a) => a.id === selected)?.dataFrom ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <MonthBar />
      <View style={{ alignItems: "center", marginTop: 2 }}>
        <LinkText onPress={() => router.push("/regras")}>Regras</LinkText>
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
      {filtered ? (
        <View style={{ paddingHorizontal: 24, marginTop: 12, flexDirection: "row" }}>
          <Pressable
            onPress={() => router.setParams({ category: undefined, from: undefined, to: undefined })}
            accessibilityLabel="Limpar filtro"
            style={{ backgroundColor: c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.ink }}>
              {category ? categoryLabel[category].name : `Dias ${days!.from} a ${days!.to}`} ✕
            </Text>
          </Pressable>
        </View>
      ) : null}
      {gaps.map((g) => (
        <View key={g.billId} style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <Fine>
            {g.text} ·{" "}
            <LinkText onPress={() => Linking.openURL(`${embeddedConfig.guideUrl}#faltam-compras-numa-fatura`)}>Saiba mais</LinkText>
          </Fine>
        </View>
      ))}
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
          <Pressable
            onPress={() => setEditing(item)}
            accessibilityRole="button"
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
                {item.date.split("-").reverse().join("/")}
                {item.installment ? ` · ${item.installment.number} de ${item.installment.total}` : ""} · {natureLabel[item.nature]}
                {item.category ? ` · ${categoryLabel[item.category].icon} ${categoryLabel[item.category].name}` : ""}
                {item.origin ? ` · ${originLabel[item.origin]}` : ""}
              </Fine>
            </View>
            <Text style={{ fontFamily: font.medium, fontSize: 16, color: item.amount < 0 ? c.ink : c.acc }}>
              {brl.format(item.amount)}
            </Text>
          </Pressable>
        )}
      />
      <EditSheet
        row={editing}
        onClose={() => {
          setEditing(null);
          void core.listTransactions({ accountId: selected ?? "", month }).then(setRows);
        }}
      />
    </View>
  );
}
