import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AccountSummary } from "../../src/core/connections";
import type { MonthSummary } from "../../src/core/summary";
import { useLiveData } from "../../src/shell/useLiveData";
import { useCore } from "../../src/shell/appCore";
import { categoryColor, useChartColors } from "../../src/shell/chartColors";
import { money, moneyRound } from "../../src/shell/format";
import { categoryLabel } from "../../src/shell/labels";
import { MonthBar } from "../../src/shell/MonthBar";
import { SourceChips } from "../../src/shell/SourceChips";
import { monthLabel, useMonth } from "../../src/shell/month";
import { Body, Fine, font, usePalette } from "../../src/shell/theme";

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;

export default function Gastos() {
  const core = useCore();
  const c = usePalette();
  const colors = useChartColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { month, sources, toggleSource } = useMonth();
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [mode, setMode] = useState<"category" | "week">("category");

  useLiveData(async (alive) => {
    const list = await core.listAccounts();
    const s = await core.monthSummary(month, sources);
    if (alive()) {
      setAccounts(list);
      setSummary(s);
    }
  }, [month, sources]);

  const monthName = monthLabel(month).split(" de ")[0];
  const gross = summary ? summary.categories.reduce((s, x) => s + x.amount, 0) : 0;
  const weekMax = Math.max(1, ...(summary?.weeks.map((w) => w.total) ?? [0]));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <MonthBar />
      <SourceChips accounts={accounts} selected={sources} onToggle={toggleSource} />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 24, marginTop: 16 }}>
        {(["category", "week"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: mode === m ? c.ink : c.track }}
          >
            <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: mode === m ? c.bg : c.ink }}>
              {m === "category" ? "Por categoria" : "Por semana"}
            </Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        {!summary ? (
          <Body style={{ color: c.ink2, marginTop: 24 }}>Calculando…</Body>
        ) : mode === "category" ? (
          <>
            <Ring
              slices={summary.categories.map((x) => ({ value: x.amount, color: categoryColor(colors, x.category) }))}
              label={`gastos de ${monthName}`}
              total={moneyRound(summary.expenses)}
            />
            {summary.categories.length === 0 ? <Body style={{ color: c.ink2 }}>Nenhum gasto neste mês.</Body> : null}
            {summary.categories.map((x) => (
              <Pressable
                key={x.category}
                onPress={() => router.push({ pathname: "/transacoes", params: { category: x.category } })}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.rule }}
              >
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(colors, x.category) }} />
                <View style={{ flex: 1 }}>
                  <Body>{categoryLabel[x.category].name}</Body>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.ink }}>{money(x.amount)}</Text>
                  <Fine>{pct(x.amount / gross)}</Fine>
                </View>
              </Pressable>
            ))}
            {summary.uncategorizedRefunds > 0 ? (
              <View style={{ marginTop: 14 }}>
                <Fine>Reembolsos recebidos: {"−"}{money(summary.uncategorizedRefunds)}, já descontados do total.</Fine>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", height: 150, marginTop: 24, gap: 10 }}>
              {summary.weeks.map((w) => (
                <Pressable
                  key={w.startDay}
                  onPress={() => router.push({ pathname: "/transacoes", params: { from: String(w.startDay), to: String(w.endDay) } })}
                  style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}
                >
                  <Fine>{moneyRound(w.total)}</Fine>
                  <View
                    style={{
                      width: "70%",
                      maxWidth: 34,
                      height: Math.max(2, (110 * Math.max(0, w.total)) / weekMax),
                      marginTop: 4,
                      borderRadius: 4,
                      backgroundColor: c.acc,
                      opacity: w.total === weekMax ? 1 : 0.55,
                    }}
                  />
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: 16 }}>
              <Fine>Semanas de segunda a domingo, cortadas nas bordas do mês. Somam o mês: {money(summary.expenses)}.</Fine>
            </View>
            <View style={{ marginTop: 8 }}>
              {summary.weeks.map((w) => (
                <Pressable
                  key={w.startDay}
                  onPress={() => router.push({ pathname: "/transacoes", params: { from: String(w.startDay), to: String(w.endDay) } })}
                  style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.rule }}
                >
                  <Body>
                    {w.startDay === w.endDay ? `Dia ${w.startDay}` : `${w.startDay} a ${w.endDay}`} de {monthName}
                  </Body>
                  <Text style={{ fontFamily: font.medium, fontSize: 16, color: c.ink }}>{money(w.total)}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const SIZE = 210;
const THICKNESS = 18;
const STEPS = 120;

/** A ring drawn with small arc pieces (no native drawing library in the app). */
function Ring({ slices, label, total }: { slices: { value: number; color: string }[]; label: string; total: string }) {
  const c = usePalette();
  const sum = slices.reduce((s, x) => s + x.value, 0);
  const radius = (SIZE - THICKNESS) / 2;
  const pieces: string[] = [];
  if (sum > 0) {
    let acc = 0;
    let index = 0;
    for (const slice of slices) {
      acc += slice.value;
      const upTo = Math.round((acc / sum) * STEPS);
      for (; index < upTo; index++) pieces.push(slice.color);
    }
    while (pieces.length < STEPS) pieces.push(slices[slices.length - 1]!.color);
  }
  const pieceWidth = (2 * Math.PI * radius) / STEPS + 1;
  return (
    <View style={{ width: SIZE, height: SIZE, alignSelf: "center", marginVertical: 20 }}>
      {pieces.length === 0 ? (
        <View style={{ position: "absolute", width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: THICKNESS, borderColor: c.track }} />
      ) : (
        pieces.map((color, i) => {
          const angle = (i / STEPS) * 2 * Math.PI;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                width: THICKNESS,
                height: pieceWidth,
                backgroundColor: color,
                left: SIZE / 2 + radius * Math.sin(angle) - THICKNESS / 2,
                top: SIZE / 2 - radius * Math.cos(angle) - pieceWidth / 2,
                transform: [{ rotate: `${angle - Math.PI / 2}rad` }],
              }}
            />
          );
        })
      )}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Fine>{label}</Fine>
        <Text style={{ fontFamily: font.semibold, fontSize: 28, color: c.ink }}>{total}</Text>
      </View>
    </View>
  );
}
