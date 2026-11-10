import { useRouter } from "expo-router";
import type { BillGap } from "../../src/core/bills";
import { embeddedConfig } from "../../src/core/config";
import { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NoticeQueue } from "../../src/core/status";
import type { ConnectionSummary } from "../../src/core/connections";
import { bankNames, readTime, stateLabel } from "../../src/shell/connectionLabels";
import type { MonthPoint, MonthSummary } from "../../src/core/summary";
import { useLiveData } from "../../src/shell/useLiveData";
import { useCore } from "../../src/shell/appCore";
import { useChartColors } from "../../src/shell/chartColors";
import { money, moneyRound, signedMoney } from "../../src/shell/format";
import { MonthBar } from "../../src/shell/MonthBar";
import { monthLabel, useMonth } from "../../src/shell/month";
import { originLabel } from "../../src/shell/labels";
import { Body, Fine, font, LinkText, usePalette } from "../../src/shell/theme";

const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export default function Resumo() {
  const core = useCore();
  const c = usePalette();
  const colors = useChartColors();
  const insets = useSafeAreaInsets();
  const { month } = useMonth();
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [history, setHistory] = useState<MonthPoint[]>([]);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [gaps, setGaps] = useState<BillGap[]>([]);
  const [queue, setQueue] = useState<NoticeQueue>({ shown: null, more: 0 });
  const router = useRouter();

  useLiveData(async (alive) => {
    const [s, h, conns, q, g] = await Promise.all([core.monthSummary(month), core.monthHistory(month, 6), core.listConnections(), core.notices(), core.billGaps({ month })]);
    if (alive()) {
      setSummary(s);
      setHistory(h);
      setConnections(conns);
      setQueue(q);
      setGaps(g);
    }
  }, [month]);

  const monthName = monthLabel(month).split(" de ")[0];
  const peak = Math.max(1, ...history.flatMap((p) => [p.income, p.expenses]));
  const BAR_H = 110;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 24, paddingRight: 12 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 28, color: c.ink }}>Resumo</Text>
        <Pressable
          onPress={() => router.push("/configuracoes")}
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          hitSlop={4}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 24, color: c.ink2 }}>⚙</Text>
        </Pressable>
      </View>
      <MonthBar />
      <StatusLine
        connections={connections}
        queue={queue}
        onOpenConnections={() => router.push("/conexoes")}
        onAction={() => {
          const n = queue.shown;
          if (!n) return;
          router.push(n.action === "backup" ? "/configuracoes/backup" : n.action === "update-secret" ? "/atualizar-secret" : n.action === "open-connections" ? "/conexoes" : "/conectar");
        }}
        onSnooze={async () => {
          if (!queue.shown) return;
          await core.snoozeNotice(queue.shown.key);
          setQueue(await core.notices());
        }}
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        {summary ? (
          <>
            <View style={{ marginTop: 28 }}>
              <Fine>Saldo de {monthName}</Fine>
              <Text style={{ fontFamily: font.semibold, fontSize: 40, color: summary.balance < 0 ? c.neg : c.ink }}>
                {signedMoney(summary.balance)}
              </Text>
              <Fine>Receitas menos gastos</Fine>
            </View>

            <View style={{ marginTop: 24 }}>
              <Row label="Receitas" value={money(summary.income.total)} color={colors.pos} />
              {(Object.keys(summary.income.byOrigin) as (keyof typeof originLabel)[])
                .filter((o) => summary.income.byOrigin[o] > 0)
                .map((o) => (
                  <View key={o} style={{ flexDirection: "row", justifyContent: "space-between", paddingLeft: 20, paddingBottom: 6 }}>
                    <Fine>{originLabel[o]}</Fine>
                    <Fine>{money(summary.income.byOrigin[o])}</Fine>
                  </View>
                ))}
              <Row label="Gastos" value={money(summary.expenses)} color={c.neg} />
              {gaps.map((g) => (
                <View key={g.billId} style={{ paddingVertical: 6 }}>
                  <Fine>
                    {g.text} ·{" "}
                    <LinkText onPress={() => Linking.openURL(`${embeddedConfig.guideUrl}#faltam-compras-numa-fatura`)}>Saiba mais</LinkText>
                  </Fine>
                </View>
              ))}
              <Row
                label="Aportes"
                value={money(summary.contributions)}
                color={c.acc}
                note={`${summary.netContribution < 0 ? "Resgate líquido" : "Aporte líquido"}: ${money(Math.abs(summary.netContribution))}`}
              />
            </View>

            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.ink, marginTop: 28 }}>Seis meses</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 12 }}>
              {history.map((p) => {
                const on = p.month === month;
                const [, m] = p.month.split("-").map(Number) as [number, number];
                return (
                  <View key={p.month} style={{ alignItems: "center", flex: 1 }}>
                    <Text style={{ fontFamily: font.medium, fontSize: 11.5, color: on ? c.ink : "transparent", marginBottom: 4 }}>
                      {moneyRound(p.balance)}
                    </Text>
                    <View style={{ height: BAR_H, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                      <View style={{ width: 9, height: Math.max(1, (BAR_H * p.income) / peak), backgroundColor: c.ink, opacity: on ? 1 : 0.35, borderRadius: 3 }} />
                      <View style={{ width: 9, height: Math.max(1, (BAR_H * p.expenses) / peak), backgroundColor: c.neg, opacity: on ? 1 : 0.45, borderRadius: 3 }} />
                    </View>
                    <Text style={{ fontFamily: font.regular, fontSize: 12, color: on ? c.ink : c.ink2, marginTop: 6 }}>{SHORT[m - 1]}</Text>
                  </View>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              <Legend color={c.ink} label="Receitas" />
              <Legend color={c.neg} label="Gastos" />
            </View>
          </>
        ) : (
          <Body style={{ color: c.ink2, marginTop: 24 }}>Calculando…</Body>
        )}
      </ScrollView>
    </View>
  );
}

function Row({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  const c = usePalette();
  return (
    <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.rule }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <Body>{label}</Body>
        </View>
        <Text style={{ fontFamily: font.medium, fontSize: 17, color: c.ink }}>{value}</Text>
      </View>
      {note ? <View style={{ alignItems: "flex-end" }}><Fine>{note}</Fine></View> : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Fine>{label}</Fine>
    </View>
  );
}

/** Under the month: the one notice that matters most, or the banks and the last read. */
function StatusLine({
  connections,
  queue,
  onOpenConnections,
  onAction,
  onSnooze,
}: {
  connections: ConnectionSummary[];
  queue: NoticeQueue;
  onOpenConnections: () => void;
  onAction: () => void;
  onSnooze: () => void;
}) {
  const c = usePalette();
  if (connections.length === 0 && !queue.shown) return null;
  const last = connections.map((x) => x.lastReadAt).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const notice = queue.shown;
  const text = notice
    ? notice.text
    : `${bankNames(connections.map((x) => x.bankName))} · ${connections.some((x) => x.state === "reading") ? "Lendo…" : readTime(last)}`;
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 10, alignItems: "center", gap: 4 }}>
      <Pressable onPress={notice ? onAction : onOpenConnections} accessibilityRole="button">
        <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: notice ? c.neg : c.ink2, textAlign: "center" }}>{text}</Text>
      </Pressable>
      {notice ? (
        <View style={{ flexDirection: "row", gap: 16 }}>
          {queue.more > 0 ? <LinkText onPress={onOpenConnections}>{`e mais ${queue.more}`}</LinkText> : null}
          {notice.snoozable ? <LinkText onPress={onSnooze}>Agora não</LinkText> : null}
        </View>
      ) : null}
    </View>
  );
}
