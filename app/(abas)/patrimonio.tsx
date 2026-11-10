import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AssetClass, NetWorthView } from "../../src/core/networth";
import type { PerformancePeriod, PerformanceView } from "../../src/core/performance";
import { useLiveData } from "../../src/shell/useLiveData";
import { EvolutionChart } from "../../src/shell/EvolutionChart";
import { useCore } from "../../src/shell/appCore";
import { money, signedMoney } from "../../src/shell/format";
import { Body, Fine, font, usePalette } from "../../src/shell/theme";

const CLASS_LABEL: Record<AssetClass, string> = {
  cash: "Caixa",
  fixedIncome: "Renda fixa",
  equity: "Renda variável",
  funds: "Fundos",
  other: "Outros",
};
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function Patrimonio() {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<NetWorthView | null>(null);
  const [perf, setPerf] = useState<PerformanceView | null>(null);

  useLiveData(async (alive) => {
    const v = await core.netWorth();
    if (alive()) setView(v);
    const p = await core.performance();
    if (alive()) setPerf(p);
  }, []);

  // One color per class: the first is the accent, the others step down in lightness.
  const shade = [c.ink, c.acc, c.ink2, c.rule, c.rule];
  const missing = view?.banks.filter((b) => b.mayBeMissing) ?? [];
  const old = view?.banks.filter((b) => b.valueDate) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 16 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
        {view ? (
          <>
            <Fine>Patrimônio de hoje</Fine>
            <Text style={{ fontFamily: font.semibold, fontSize: 40, color: view.total < 0 ? c.neg : c.ink }}>{signedMoney(view.total)}</Text>
            {view.variation !== null ? (
              <Fine>
                {view.variation >= 0 ? "+" : "−"}
                {money(Math.abs(view.variation))} desde o mês passado
              </Fine>
            ) : null}

            {view.classes.length > 0 ? (
              <>
                <View style={{ flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", marginTop: 24 }}>
                  {view.classes.map((k, i) => (
                    <View key={k.class} style={{ flex: Math.max(k.share, 0.01), backgroundColor: shade[Math.min(i, shade.length - 1)] }} />
                  ))}
                </View>
                <View style={{ marginTop: 8 }}>
                  {view.classes.map((k, i) => (
                    <Line key={k.class} dot={shade[Math.min(i, shade.length - 1)]!} label={CLASS_LABEL[k.class]} value={money(k.value)} />
                  ))}
                  {view.debt < 0 ? <Line label="Dívidas" value={signedMoney(view.debt)} negative /> : null}
                </View>
              </>
            ) : (
              <Body style={{ color: c.ink2, marginTop: 24 }}>Conecte um banco para ver o patrimônio.</Body>
            )}

            <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.ink, marginTop: 28 }}>Evolução</Text>
            <EvolutionChart curve={view.curve} />

            {perf ? (
              <>
                <Text style={{ fontFamily: font.semibold, fontSize: 16, color: c.ink, marginTop: 28 }}>Rentabilidade</Text>
                <Line label="Aporte líquido no mês" value={signedMoney(perf.month.netContribution)} />
                <Line label="Valorização no mês" value={perf.month.appreciation === null ? "—" : signedMoney(perf.month.appreciation)} />
                <Line label={`Rentabilidade no mês${perf.month.estimated ? " (estimada)" : ""}`} value={pct(perf.month)} />
                <Line label="CDI no mês" value={pctValue(perf.month.cdi)} />
                <Line label={`Rentabilidade no ano${perf.year.estimated ? " (estimada)" : ""}`} value={pct(perf.year)} />
                <Line label="CDI no ano" value={pctValue(perf.year.cdi)} />
              </>
            ) : null}

            {view.estimating.map((name) => (
              <Fine key={name}>Estimando o histórico do {name}…</Fine>
            ))}
            {old.map((b) => (
              <Fine key={b.itemId}>
                {b.bankName}: valor de {ddmm(b.valueDate!)}
              </Fine>
            ))}
            {missing.map((b) => (
              <Fine key={b.itemId}>{b.bankName}: pode faltar</Fine>
            ))}
            <View style={{ marginTop: 20 }}>
              <Fine>Não entram: cripto, FGTS, imóveis e o que os bancos não compartilham pelo Open Finance.</Fine>
            </View>
          </>
        ) : (
          <Body style={{ color: c.ink2, marginTop: 24 }}>Calculando…</Body>
        )}
      </ScrollView>
    </View>
  );
}

const pctValue = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(2).replace(".", ",")}%`);
const pct = (p: PerformancePeriod) => pctValue(p.rentability);

function Line({ dot, label, value, negative }: { dot?: string; label: string; value: string; negative?: boolean }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.rule }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : <View style={{ width: 10 }} />}
        <Body>{label}</Body>
      </View>
      <Text style={{ fontFamily: font.medium, fontSize: 17, color: negative ? c.neg : c.ink }}>{value}</Text>
    </View>
  );
}
