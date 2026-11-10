// PROTOTYPE: bottom sheet with the account chips (multi-select), the active Gastos filter and the Regras entry.
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AccountSummary } from "../../core/connections";
import { sourceLabel } from "../sourceLabel";
import { font, usePalette } from "../theme";

export function FilterSheet(p: {
  visible: boolean;
  title: string;
  onClose: () => void;
  accounts: AccountSummary[];
  sources: string[];
  toggleSource: (id: string) => void;
  activeFilter?: string;
  clearFilter: () => void;
  onRules: () => void;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const chip = (on: boolean) => ({ backgroundColor: on ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 });
  const label = { fontFamily: font.semibold, fontSize: 15, color: c.ink } as const;
  return (
    <Modal visible={p.visible} transparent animationType="slide" onRequestClose={p.onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#00000066" }} onPress={p.onClose} />
      <View style={{ backgroundColor: c.bg, padding: 24, paddingBottom: insets.bottom + 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}>
        <ScrollView>
          <Text style={{ ...label, fontSize: 18 }}>{p.title}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
            {p.accounts.map((a) => {
              const on = p.sources.includes(a.id);
              return (
                <Pressable key={a.id} onPress={() => p.toggleSource(a.id)} accessibilityState={{ selected: on }} style={chip(on)}>
                  <Text style={{ fontFamily: font.medium, fontSize: 14, color: on ? c.bg : c.ink }}>{sourceLabel(a)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink2, marginTop: 10 }}>Nenhuma escolhida = todas as contas.</Text>
          {p.activeFilter ? (
            <Pressable onPress={p.clearFilter} style={{ ...chip(false), alignSelf: "flex-start", marginTop: 18 }}>
              <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.ink }}>{p.activeFilter} ✕</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => {
              p.onClose();
              p.onRules();
            }}
            style={{ marginTop: 22 }}
          >
            <Text style={{ fontFamily: font.medium, fontSize: 15, color: c.acc, textDecorationLine: "underline" }}>Regras</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
