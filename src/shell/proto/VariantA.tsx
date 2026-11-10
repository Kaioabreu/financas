// PROTOTYPE A "Dia a dia": sticky day headers, one line per row, category as a dot.
import { useMemo, useState } from "react";
import { Pressable, SectionList, Text, View } from "react-native";
import { categoryLabel } from "../labels";
import { categoryColor, useChartColors } from "../chartColors";
import { monthLabel, shiftMonth, useMonth } from "../month";
import { pixLabel } from "../pixLabel";
import { font, usePalette } from "../theme";
import { FilterSheet } from "./FilterSheet";
import { amountColor, effective, groupByDay, money, signedMoney, shortDay, weekday, type TxProps } from "./shared";

export function VariantA(p: TxProps) {
  const c = usePalette();
  const colors = useChartColors();
  const { month, setMonth } = useMonth();
  const [sheet, setSheet] = useState(false);
  const sections = useMemo(() => groupByDay(p.rows), [p.rows]);
  const active = p.sources.length + (p.category || p.days ? 1 : 0);
  const arrow = { fontFamily: font.medium, fontSize: 22, color: c.ink, paddingHorizontal: 10 } as const;
  const activeFilter = p.category ? categoryLabel[p.category].name : p.days ? `Dias ${p.days.from} a ${p.days.to}` : undefined;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, height: 44 }}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={8} accessibilityLabel="Mês anterior">
          <Text style={arrow}>‹</Text>
        </Pressable>
        <Text style={{ fontFamily: font.semibold, fontSize: 17, color: c.ink }}>{monthLabel(month)}</Text>
        <Pressable onPress={() => setMonth(shiftMonth(month, 1))} hitSlop={8} accessibilityLabel="Próximo mês">
          <Text style={arrow}>›</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => setSheet(true)}
          accessibilityLabel="Filtros"
          style={{ backgroundColor: active ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ fontFamily: font.medium, fontSize: 14, color: active ? c.bg : c.ink }}>⚙ Filtros{active ? ` · ${active}` : ""}</Text>
        </Pressable>
      </View>
      {p.banners}
      <SectionList
        refreshControl={p.refreshControl}
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: p.bottomPad }}
        ListEmptyComponent={<Text style={{ fontFamily: font.regular, fontSize: 16, color: c.ink2, margin: 24 }}>{p.emptyText}</Text>}
        renderSectionHeader={({ section }) => (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              backgroundColor: c.bg,
              paddingHorizontal: 24,
              paddingTop: 14,
              paddingBottom: 6,
              borderBottomWidth: 1,
              borderBottomColor: c.rule,
            }}
          >
            <Text style={{ fontFamily: font.semibold, fontSize: 13.5, color: c.ink2 }}>
              {shortDay(section.date)} · {weekday(section.date)}
            </Text>
            <Text style={{ fontFamily: font.medium, fontSize: 13.5, color: c.ink2 }}>{signedMoney(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const label = pixLabel(item.description, effective(item), { style: "initial" });
          const cat = item.category && item.category !== "other" ? item.category : undefined;
          return (
            <Pressable
              onPress={() => p.onEdit(item)}
              accessibilityRole="button"
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 11, gap: 10 }}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cat ? categoryColor(colors, cat) : "transparent" }} />
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.ink }}>
                {label.title}
                {cat ? <Text style={{ color: c.ink2, fontSize: 13.5 }}>{`  ${categoryLabel[cat].name}`}</Text> : null}
              </Text>
              <Text style={{ fontFamily: font.medium, fontSize: 16, color: amountColor(item, c, colors.pos) }}>{money(item)}</Text>
            </Pressable>
          );
        }}
      />
      <FilterSheet
        visible={sheet}
        title="Filtros"
        onClose={() => setSheet(false)}
        accounts={p.accounts}
        sources={p.sources}
        toggleSource={p.toggleSource}
        activeFilter={activeFilter}
        clearFilter={p.clearFilter}
        onRules={p.onRules}
      />
    </View>
  );
}
