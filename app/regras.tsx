import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { BuiltInRule } from "../src/core/config";
import type { RuleOutcome, UserRule } from "../src/core/classification";
import { useCore } from "../src/shell/appCore";
import { categoryLabel, natureLabel, originLabel } from "../src/shell/labels";
import { Body, Fine, font, Screen, usePalette } from "../src/shell/theme";

function outcomeText(r: RuleOutcome) {
  return [
    r.nature ? natureLabel[r.nature] : null,
    r.category ? `${categoryLabel[r.category].icon} ${categoryLabel[r.category].name}` : null,
    r.origin ? originLabel[r.origin] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function Regras() {
  const core = useCore();
  const c = usePalette();
  const [user, setUser] = useState<UserRule[]>([]);
  const [builtIn, setBuiltIn] = useState<BuiltInRule[]>([]);
  const load = useCallback(async () => {
    const rules = await core.listRules();
    setUser(rules.user);
    setBuiltIn(rules.builtIn.filter((r) => r.contains));
  }, [core]);
  useEffect(() => {
    void load();
  }, [load]);

  const heading = { fontFamily: font.semibold, fontSize: 18, color: c.ink, marginTop: 8, marginBottom: 4 } as const;
  return (
    <Screen title="Regras">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={heading}>Suas regras</Text>
        {user.length === 0 ? <Fine>Nenhuma ainda. Ao corrigir uma transação, use "Aplicar às parecidas".</Fine> : null}
        {user.map((r) => (
          <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.rule }}>
            <View style={{ flex: 1 }}>
              <Body>Contém "{r.contains}"</Body>
              <Fine>{outcomeText(r)}</Fine>
            </View>
            <Pressable
              onPress={async () => {
                await core.deleteRule(r.id);
                await load();
              }}
              hitSlop={12}
              accessibilityLabel={`Apagar a regra ${r.contains}`}
            >
              <Text style={{ fontFamily: font.medium, fontSize: 18, color: c.ink2 }}>✕</Text>
            </Pressable>
          </View>
        ))}
        <Text style={[heading, { marginTop: 28 }]}>Regras do app</Text>
        <Fine>Só para leitura. Uma regra sua sobrepõe a do app.</Fine>
        {builtIn.map((r, i) => (
          <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.rule }}>
            <Body>
              Contém "{r.contains.toLowerCase()}"{r.direction ? (r.direction === "credit" ? " (entrada)" : " (saída)") : ""}
            </Body>
            <Fine>{outcomeText(r)}</Fine>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
