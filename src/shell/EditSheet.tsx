import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppCategory, Classification, IncomeOrigin, Nature } from "../core/classification";
import type { TransactionRow } from "../core/connections";
import { useCore } from "./appCore";
import { categoryLabel, categoryOrder, natureLabel, natureOrder, originLabel, originOrder, sourceLabel } from "./labels";
import { Body, Button, Fine, font, usePalette } from "./theme";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function Chip({ label, on, onPress, wide }: { label: string; on: boolean; onPress: () => void; wide?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{ width: wide ? "100%" : "48%", backgroundColor: on ? c.ink : c.track, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 }}
    >
      <Text style={{ fontFamily: font.medium, fontSize: 14.5, color: on ? c.bg : c.ink }}>{label}</Text>
    </Pressable>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, marginTop: 8 }}>{children}</View>
);

/** Bottom sheet to correct one transaction and, if wanted, turn the correction into a rule. */
export function EditSheet({ row, onClose }: { row: TransactionRow | null; onClose: () => void }) {
  const core = useCore();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [nature, setNature] = useState<Nature>("expense");
  const [category, setCategory] = useState<AppCategory | undefined>();
  const [origin, setOrigin] = useState<IncomeOrigin>("other-income");
  const [similar, setSimilar] = useState(false);
  const [ruleText, setRuleText] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setNature(row.nature);
    setCategory(row.category);
    setOrigin(row.origin ?? "other-income");
    setSimilar(false);
    setRuleText(row.description);
    setError(null);
  }, [row?.id]);

  const outcome = (): Classification => ({
    nature,
    ...(nature === "expense" || nature === "refund" ? (category ? { category } : {}) : {}),
    ...(nature === "income" ? { origin } : {}),
  });

  useEffect(() => {
    if (!row || !similar) return setCount(null);
    let alive = true;
    core.previewRule({ contains: ruleText, ...outcome() }).then((r) => alive && setCount(r.count));
    return () => {
      alive = false;
    };
  }, [similar, ruleText, nature, category, origin]);

  async function save() {
    if (!row) return;
    if (similar) {
      const result = await core.addRule({ contains: ruleText, ...outcome() });
      if (!result.ok) return setError(result.message);
    }
    await core.editTransaction(row.id, outcome());
    onClose();
  }

  const withCategory = nature === "expense" || nature === "refund";
  const label = { fontFamily: font.semibold, fontSize: 15, color: c.ink, marginTop: 20 } as const;
  return (
    <Modal visible={!!row} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#0008" }} onPress={onClose} accessibilityLabel="Fechar" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: insets.bottom + 16 }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 640 }} contentContainerStyle={{ padding: 24 }}>
            {row ? (
              <>
                <Text style={{ fontFamily: font.semibold, fontSize: 20, color: c.ink }}>{row.description}</Text>
                <Body style={{ color: row.amount < 0 ? c.ink : c.acc }}>{brl.format(row.amount)}</Body>
                <Fine>
                  {row.date.split("-").reverse().join("/")} · {row.accountName}
                </Fine>
                {row.installment ? (
                  <Fine>
                    Parcela {row.installment.number} de {row.installment.total} · compra de {row.purchaseDate?.split("-").reverse().join("/")}. Mudar a classificação vale para a compra inteira.
                  </Fine>
                ) : null}
                <Fine>Classificação: {sourceLabel[row.source]}</Fine>

                <Text style={label}>Natureza</Text>
                <Grid>
                  {natureOrder.map((n) => (
                    <Chip key={n} label={natureLabel[n]} on={nature === n} onPress={() => setNature(n)} />
                  ))}
                </Grid>

                {withCategory ? (
                  <>
                    <Text style={label}>Categoria</Text>
                    <Grid>
                      {nature === "refund" ? <Chip label="Sem categoria" on={!category} onPress={() => setCategory(undefined)} /> : null}
                      {categoryOrder.map((k) => (
                        <Chip key={k} label={`${categoryLabel[k].icon} ${categoryLabel[k].name}`} on={category === k} onPress={() => setCategory(k)} />
                      ))}
                    </Grid>
                  </>
                ) : null}

                {nature === "income" ? (
                  <>
                    <Text style={label}>Origem</Text>
                    <Grid>
                      {originOrder.map((o) => (
                        <Chip key={o} label={originLabel[o]} on={origin === o} onPress={() => setOrigin(o)} />
                      ))}
                    </Grid>
                  </>
                ) : null}

                <View style={{ marginTop: 20 }}>
                  <Chip label={similar ? "✓ Aplicar às parecidas" : "Aplicar às parecidas"} on={similar} onPress={() => setSimilar(!similar)} wide />
                </View>
                {similar ? (
                  <View style={{ marginTop: 10 }}>
                    <Fine>Vale para toda transação cuja descrição contém:</Fine>
                    <TextInput
                      value={ruleText}
                      onChangeText={setRuleText}
                      autoCapitalize="none"
                      style={{ fontFamily: font.regular, fontSize: 16, color: c.ink, backgroundColor: c.track, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginTop: 6 }}
                    />
                    <Fine>
                      {count === null ? "Contando…" : count === 1 ? "Pega 1 transação, passadas e futuras." : `Pega ${count} transações, passadas e futuras.`} As editadas à mão não mudam.
                    </Fine>
                  </View>
                ) : null}
                {error ? <Text style={{ fontFamily: font.medium, color: c.neg, marginTop: 12 }}>{error}</Text> : null}
                <View style={{ marginTop: 20, gap: 10 }}>
                  <Button label="Salvar" onPress={save} />
                  <Button label="Cancelar" secondary onPress={onClose} />
                </View>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
