import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BillGap } from "../../src/core/bills";
import { embeddedConfig } from "../../src/core/config";
import type { AccountSummary, ConnectionSummary, TransactionRow } from "../../src/core/connections";
import { useLiveData } from "../../src/shell/useLiveData";
import { useCore } from "../../src/shell/appCore";
import { MonthBar } from "../../src/shell/MonthBar";
import { sourceLabel } from "../../src/shell/sourceLabel";
import { useMonth } from "../../src/shell/month";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AppCategory, CpfStatus } from "../../src/core/classification";
import { categoryLabel } from "../../src/shell/labels";
import { useChartColors } from "../../src/shell/chartColors";
import { dayHeading, withDayHeadings } from "../../src/shell/dayGroups";
import { RowIcon } from "../../src/shell/icons/RowIcon";
import { amountColor, directionIcon, flowOf, signedAmount } from "../../src/shell/rowFlow";
import { rowTitle } from "../../src/shell/rowTitle";
import { Fine, font, LinkText, usePalette } from "../../src/shell/theme";
import { EditSheet } from "../../src/shell/EditSheet";

export default function Transacoes() {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { month, sources, toggleSource } = useMonth();
  const params = useLocalSearchParams<{ category?: string; from?: string; to?: string }>();
  const category = params.category as AppCategory | undefined;
  const days = params.from && params.to ? { from: Number(params.from), to: Number(params.to) } : undefined;
  const filtered = Boolean(category || days);
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [gaps, setGaps] = useState<BillGap[]>([]);
  const [cpf, setCpf] = useState<CpfStatus | null>(null);
  const router = useRouter();
  const colors = useChartColors();
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

  // Nothing chosen = every account and card; coming from Gastos, only what that slice summed.
  const fetchRows = () => core.listTransactions({ month, category, days, accountIds: sources });

  // The tab fills in as the first read advances: it reloads when the stored data changes.
  useLiveData(async (alive) => {
    const list = await core.listAccounts();
    if (!alive()) return;
    setAccounts(list);
    setConnections(await core.listConnections());
    setCpf(await core.cpfStatus());
    const only = sources.length === 1 ? list.find((a) => a.id === sources[0]) : undefined;
    const gapsFound = only?.kind === "card" && !filtered ? await core.billGaps({ month, accountId: only.id }) : [];
    if (alive()) setGaps(gapsFound);
    const found = await fetchRows();
    if (alive()) setRows(found);
  }, [month, filtered, category, days?.from, days?.to, sources]);

  const dataAt = accounts.find((a) => sources.includes(a.id))?.dataFrom ?? null;
  const items = useMemo(() => withDayHeadings(rows), [rows]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const filterName = category ? categoryLabel[category].name : days ? `Dias ${days.from} a ${days.to}` : undefined;
  const chip = (on: boolean) =>
    ({ flexShrink: 0, backgroundColor: on ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }) as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <MonthBar />
      <View style={{ alignItems: "center", marginTop: 2 }}>
        <LinkText onPress={() => router.push("/regras")}>Regras</LinkText>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // flexShrink 0: a ScrollView shrinks by default and would clip the chips vertically.
        style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
      >
        {filterName ? (
          <Pressable
            onPress={() => router.setParams({ category: undefined, from: undefined, to: undefined })}
            accessibilityLabel="Limpar filtro"
            style={{ ...chip(false), borderWidth: 1, borderColor: c.ink }}
          >
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.ink }}>{filterName} ✕</Text>
          </Pressable>
        ) : null}
        {accounts.length > 1
          ? accounts.map((a) => {
              const on = sources.includes(a.id);
              return (
                <Pressable key={a.id} onPress={() => toggleSource(a.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={chip(on)}>
                  <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14, color: on ? c.bg : c.ink }}>
                    {sourceLabel(a)}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
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
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text style={{ fontFamily: font.regular, fontSize: 16, color: c.ink2, marginTop: 12 }}>
            {accounts.length ? "Nenhuma transação neste mês." : "Lendo os dados do banco…"}
          </Text>
        }
        renderItem={({ item }) => {
          if (item.kind === "day") {
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 4 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: c.ink2 }}>{dayHeading(item.date)}</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.rule }} />
              </View>
            );
          }
          const r = item.row;
          const label = rowTitle(r.description, r.amount);
          const cat = r.category && r.category !== "other" ? r.category : undefined;
          const acc = accountById.get(r.accountId);
          const where = acc ? sourceLabel(acc) : r.accountName;
          const sub = [where, cat ? categoryLabel[cat].name : null]
            .filter(Boolean)
            .join(" · ");
          return (
            <Pressable onPress={() => setEditing(r)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
              {label.name ? <RowIcon initial={label.name.charAt(0).toUpperCase()} /> : <RowIcon icon={cat ?? directionIcon(r)} />}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 16, color: c.ink }}>
                  {label.title}
                </Text>
                <Text numberOfLines={2} style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink2 }}>
                  {sub}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ fontFamily: font.medium, fontSize: 16, color: amountColor(flowOf(r), c, colors.pos) }}>{signedAmount(r)}</Text>
                {r.installment ? (<Text style={{ fontFamily: font.regular, fontSize: 12.5, color: c.ink2 }}>{`${r.installment.number} de ${r.installment.total}`}</Text>) : null}
              </View>
            </Pressable>
          );
        }}
      />
      <EditSheet
        row={editing}
        onClose={() => {
          setEditing(null);
          void fetchRows().then(setRows);
        }}
      />
    </View>
  );
}
