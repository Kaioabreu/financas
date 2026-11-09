import { useColorScheme } from "react-native";
import type { AppCategory } from "../core/classification";

// Colors from the prototype of ticket #5 (validated on #FFFFFF and #000000):
// seven categories have a hue of their own; the other four share the gray.
const light = {
  transport: "#2D62B0", food: "#B8325A", shopping: "#B07A0A", health: "#0E8AA6", travel: "#C0622B", leisure: "#7650B0", groceries: "#2F8A5F", other: "#8B9196",
  pos: "#1E7A4C",
};
const dark = {
  transport: "#5B8FE0", food: "#E0577F", shopping: "#B88517", health: "#1C9AB4", travel: "#D06E3A", leisure: "#9C7BDB", groceries: "#46A877", other: "#80878E",
  pos: "#4CC38A",
};

export type ChartColors = typeof light;

export function useChartColors(): ChartColors {
  return useColorScheme() === "dark" ? dark : light;
}

export function categoryColor(colors: ChartColors, category: AppCategory): string {
  switch (category) {
    case "transport":
    case "food":
    case "shopping":
    case "health":
    case "travel":
    case "leisure":
    case "groceries":
      return colors[category];
    default:
      return colors.other;
  }
}
