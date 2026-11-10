// PROTOTYPE C "Extrato minimalista": day number gutter, title, amount; touch expands the row inline.
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { categoryLabel, natureLabel, originLabel } from "../labels";
import { useChartColors } from "../chartColors";
import { MonthBar } from "../MonthBar";
import { pixLabel } from "../pixLabel";
import { sourceLabel } from "../sourceLabel";
import { Button, font, usePalette } from "../theme";
import { FilterSheet } from "./FilterSheet";
import { amountColor, effective, money, type TxProps } from "./shared";

type Tab = "all" | "out" | "in";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Tudo" },
  { key: "out", label: "Gastos" },
  { key: "in", label: "Entradas" },
];

export function VariantC(p: TxProps) {
  const c = usePalette();
  const colors = useChartColors();
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const accountById = useMemo(() => new Map(p.accounts.map((a) => [a.id, a])), [p.accounts]);
  const data = useMemo(() => {
    const list = [...p.rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return tab === "out" ? list.filter((r) => r.nature === "expense") : tab === "in" ? list.filter((r) => r.nature === "income" || r.nature === "refund") : list;
  }, [p.rows, tab]);
  const filterName = p.category ? categoryLabel[p.category].name : p.days ? `Dias ${p.days.from} a ${p.days.to}` : undefined;
  const marked = p.sources.length > 0 || !!filterName;
  const detail = (k: string, v: string) => (
    <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
      <Text style={{ width: 78, fontFamily: font.regular, fontSize: 13.5, color: c.ink2 }}>{k}</Text>
      <Text style={{ flex: 1, fontFamily: font.regular, fontSize: 13.5, color: c.ink }}>{v}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <MonthBar />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 24, marginTop: 4 }}>
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: c.track, borderRadius: 10, padding: 3 }}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{ flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8, backgroundColor: tab === t.key ? c.bg : "transparent" }}
            >
              <Text style={{ fontFamily: tab === t.key ? font.semibold : font.regular, fontSize: 14, color: c.ink }}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => setSheet(true)} style={{ backgroundColor: marked ? c.ink : c.track, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ fontFamily: font.medium, fontSize: 14, color: marked ? c.bg : c.ink }}>
            Contas{p.sources.length ? ` · ${p.sources.length}` : ""}
          </Text>
        </Pressable>
      </View>
      {p.banners}
      <FlatList
        refreshControl={p.refreshControl}
        style={{ marginTop: 8 }}
        data={data}
        extraData={open}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: p.bottomPad }}
        ListEmptyComponent={<Text style={{ fontFamily: font.regular, fontSize: 16, color: c.ink2, margin: 24 }}>{p.emptyText}</Text>}
        renderItem={({ item, index }) => {
          const prev = data[index - 1];
          const firstOfDay = !prev || prev.date !== item.date;
          const label = pixLabel(item.description, effective(item), { style: "initial" });
          const expanded = open === item.id;
          const acc = accountById.get(item.accountId);
          return (
            <Pressable
              onPress={() => setOpen(expanded ? null : item.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={{ paddingVertical: 11, paddingHorizontal: 24, backgroundColor: expanded ? c.track : "transparent" }}
            >
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12 }}>
                <Text style={{ width: 24, fontFamily: font.semibold, fontSize: 15, color: c.ink2 }}>{firstOfDay ? Number(item.date.slice(8)) : ""}</Text>
                <Text numberOfLines={expanded ? 2 : 1} style={{ flex: 1, fontFamily: font.regular, fontSize: 16, color: c.ink }}>
                  {label.title}
                </Text>
                <Text style={{ fontFamily: font.medium, fontSize: 16, color: amountColor(item, c, colors.pos) }}>{money(item)}</Text>
              </View>
              {expanded ? (
                <View style={{ marginLeft: 36, marginTop: 8 }}>
                  {detail("Original", label.original)}
                  {detail("Data", item.date.split("-").reverse().join("/") + (item.installment ? ` · ${item.installment.number} de ${item.installment.total}` : ""))}
                  {detail("Conta", acc ? sourceLabel(acc) : item.accountName)}
                  {detail("Natureza", natureLabel[item.nature])}
                  {item.category ? detail("Categoria", categoryLabel[item.category].name) : null}
                  {item.origin ? detail("Origem", originLabel[item.origin]) : null}
                  <View style={{ marginTop: 12, alignSelf: "flex-start" }}>
                    <Button label="Editar" secondary onPress={() => p.onEdit(item)} />
                  </View>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      <FilterSheet
        visible={sheet}
        title="Contas"
        onClose={() => setSheet(false)}
        accounts={p.accounts}
        sources={p.sources}
        toggleSource={p.toggleSource}
        activeFilter={filterName}
        clearFilter={p.clearFilter}
        onRules={p.onRules}
      />
    </View>
  );
}
