import { useState } from "react";
import { Linking, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BillGap } from "../../src/core/bills";
import { embeddedConfig } from "../../src/core/config";
import type { AccountSummary, ConnectionSummary, TransactionRow } from "../../src/core/connections";
import { useLiveData } from "../../src/shell/useLiveData";
import { useCore } from "../../src/shell/appCore";
import { PrototypeSwitcher } from "../../src/shell/proto/PrototypeSwitcher";
import { getVariant, setVariant } from "../../src/shell/proto/shared";
import { VariantA } from "../../src/shell/proto/VariantA";
import { VariantB } from "../../src/shell/proto/VariantB";
import { VariantC } from "../../src/shell/proto/VariantC";
import { useMonth } from "../../src/shell/month";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { AppCategory, CpfStatus } from "../../src/core/classification";
import { Fine, LinkText, usePalette } from "../../src/shell/theme";
import { EditSheet } from "../../src/shell/EditSheet";

// PROTOTYPE (prototype/transacoes-linhas): three list layouts switched by a floating pill.
const NAMES = ["Dia a dia", "Cartões com ícone", "Extrato minimalista"];

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
  const [variant, setVariantState] = useState(getVariant());
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
  const common = {
    rows,
    accounts,
    sources,
    toggleSource,
    category,
    days,
    clearFilter: () => router.setParams({ category: undefined, from: undefined, to: undefined }),
    onEdit: setEditing,
    onRules: () => router.push("/regras"),
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={refresh} />,
    emptyText: accounts.length ? "Nenhuma transação neste mês." : "Lendo os dados do banco…",
    bottomPad: 80,
    banners: (
      <>
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
      </>
    ),
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8 }}>
      {variant === 0 ? <VariantA {...common} /> : variant === 1 ? <VariantB {...common} /> : <VariantC {...common} />}
      <PrototypeSwitcher
        names={NAMES}
        index={variant}
        onChange={(i) => {
          setVariant(i);
          setVariantState(i);
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
