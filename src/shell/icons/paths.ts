import type { AppCategory } from "../../core/classification";

/** The direction glyphs for a row without a category icon. */
export type DirectionIcon = "out" | "in" | "own-transfer" | "investment";
export type IconName = AppCategory | DirectionIcon;

/** Every glyph is drawn on this grid, with this stroke, so the whole set looks like one family. */
export const ICON_VIEWBOX = 24;
export const ICON_STROKE = 1.6;

/** Circle as a path, so every glyph is just stroke paths. */
const dot = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const iconPaths: Record<IconName, string[]> = {
  groceries: ["M3 4h2l2.4 11h10.2l2-8H6.2", dot(9, 19.5, 1.2), dot(17, 19.5, 1.2)],
  food: ["M6 3v6a3 3 0 0 0 6 0V3", "M9 12v9", "M17 21V3c-2 1.5-3 4-3 7h3"],
  transport: ["M7 4h10a3 3 0 0 1 3 3v10H4V7a3 3 0 0 1 3-3z", "M4 11h16", "M7 17v3", "M17 17v3", "M8 14h.01", "M16 14h.01"],
  shopping: ["M5 8h14l-1 12H6L5 8z", "M9 8V6a3 3 0 0 1 6 0v2"],
  leisure: ["M8 7h8a5 5 0 0 1 0 10H8A5 5 0 0 1 8 7z", "M8 10v4", "M6 12h4", "M16 11h.01", "M18 13h.01"],
  health: ["M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z", "M12 8v8", "M8 12h8"],
  travel: ["M21 4L3 11l7 3 3 7 8-17z"],
  subscriptions: ["M4 12a8 8 0 0 1 14-5.3", "M18 3v4h-4", "M20 12a8 8 0 0 1-14 5.3", "M6 21v-4h4"],
  "fixed-bills": ["M6 3h12v18l-3-2-3 2-3-2-3 2V3z", "M9 8h6", "M9 12h6"],
  "fees-taxes": ["M18 6L6 18", dot(7.5, 7.5, 2), dot(16.5, 16.5, 2)],
  other: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  out: ["M7 17L17 7", "M9 7h8v8"],
  in: ["M17 7L7 17", "M15 17H7V9"],
  "own-transfer": ["M4 8h14", "M14 4l4 4-4 4", "M20 16H6", "M10 12l-4 4 4 4"],
  investment: ["M3 17l6-6 4 4 8-8", "M15 7h6v6"],
};
