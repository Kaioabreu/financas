// PROTOTYPE B "Cartões com ícone": roomy two-line items with a round icon, thin day dividers, one chip row.
import { useMemo } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import type { TransactionRow } from "../../core/connections";
import { categoryLabel } from "../labels";
import { categoryColor, useChartColors } from "../chartColors";
import { MonthBar } from "../MonthBar";
import { pixLabel } from "../pixLabel";
import { sourceLabel } from "../sourceLabel";
import { font, usePalette } from "../theme";
import { brl, groupByDay, shortDay, weekday, type TxProps } from "./shared";

type Item = { kind: "day"; key: string; date: string } | { kind: "row"; key: string; row: TransactionRow };

export function VariantB(p: TxProps) {
  const c = usePalette();
  const colors = useChartColors();
  const items = useMemo<Item[]>(
    () =>
      groupByDay(p.rows).flatMap((g) => [
        { kind: "day" as const, key: `d${g.date}`, date: g.date },
        ...g.data.map((row) => ({ kind: "row" as const, key: row.id, row })),
      ]),
    [p.rows],
  );
  const accountById = useMemo(() => new Map(p.accounts.map((a) => [a.id, a])), [p.accounts]);
  const filterName = p.category ? categoryLabel[p.category].name : p.days ? `Dias ${p.days.from} a ${p.days.to}` : undefined;
  const chip = (on: boolean) =>
    ({ flexShrink: 0, backgroundColor: on ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }) as const;

  return (
    <View style={{ flex: 1 }}>
      <MonthBar />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0, marginTop: 4 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
      >
        {filterName ? (
          <Pressable onPress={p.clearFilter} accessibilityLabel="Limpar filtro" style={{ ...chip(false), borderWidth: 1, borderColor: c.ink }}>
            <Text style={{ fontFamily: font.medium, fontSize: 14, color: c.ink }}>{filterName} ✕</Text>
          </Pressable>
        ) : null}
        {p.accounts.length > 1
          ? p.accounts.map((a) => {
              const on = p.sources.includes(a.id);
              return (
                <Pressable key={a.id} onPress={() => p.toggleSource(a.id)} accessibilityState={{ selected: on }} style={chip(on)}>
                  <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 14, color: on ? c.bg : c.ink }}>
                    {sourceLabel(a)}
                  </Text>
                </Pressable>
              );
            })
          : null}
      </ScrollView>
      {p.banners}
      <FlatList
        refreshControl={p.refreshControl}
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: p.bottomPad }}
        ListEmptyComponent={<Text style={{ fontFamily: font.regular, fontSize: 16, color: c.ink2, marginTop: 12 }}>{p.emptyText}</Text>}
        renderItem={({ item }) => {
          if (item.kind === "day") {
            return (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 4 }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: c.ink2 }}>
                  {shortDay(item.date)} · {weekday(item.date)}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.rule }} />
              </View>
            );
          }
          const r = item.row;
          const label = pixLabel(r.description, r.amount, { style: "full" });
          const cat = r.category && r.category !== "other" ? r.category : undefined;
          const acc = accountById.get(r.accountId);
          const where = acc ? sourceLabel(acc) : r.accountName;
          const glyph = label.name ? label.name.charAt(0).toUpperCase() : cat ? categoryLabel[cat].icon : r.amount < 0 ? "↑" : "↓";
          return (
            <Pressable onPress={() => p.onEdit(r)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.track, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontFamily: font.semibold, fontSize: 17, color: cat ? categoryColor(colors, cat) : c.ink }}>{glyph}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 16, color: c.ink }}>
                  {label.title}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: font.regular, fontSize: 13.5, color: c.ink2 }}>
                  {where}
                  {cat ? ` · ${categoryLabel[cat].name}` : ""}
                </Text>
              </View>
              <Text style={{ fontFamily: font.medium, fontSize: 16, color: r.amount < 0 ? c.ink : colors.pos }}>{brl.format(r.amount)}</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
