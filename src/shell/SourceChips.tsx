import { Pressable, ScrollView, Text } from "react-native";
import type { AccountSummary } from "../core/connections";
import { sourceLabel } from "./sourceLabel";
import { font, usePalette } from "./theme";

/**
 * One chip per account or card; touching toggles it. Nothing chosen means every account.
 * Shared by Gastos and Transações, which read the same choice from the month context.
 */
export function SourceChips({ accounts, selected, onToggle }: { accounts: AccountSummary[]; selected: string[]; onToggle: (id: string) => void }) {
  const c = usePalette();
  if (accounts.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // flexShrink 0: a ScrollView shrinks by default and would clip the chips vertically.
      style={{ flexGrow: 0, flexShrink: 0, marginTop: 12 }}
      contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
    >
      {accounts.map((a) => {
        const on = selected.includes(a.id);
        return (
          <Pressable
            key={a.id}
            onPress={() => onToggle(a.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            // flexShrink 0: the chip is as wide as its text, so a name is never cut or squeezed.
            style={{ flexShrink: 0, backgroundColor: on ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14, color: on ? c.bg : c.ink }}>
              {sourceLabel(a)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
