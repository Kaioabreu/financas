import { describe, expect, it } from "vitest";
import { categoryLabel } from "../labels";
import { iconPaths } from "./paths";

describe("iconPaths", () => {
  it("has a glyph for each of the 11 categories and the 4 directions", () => {
    for (const cat of Object.keys(categoryLabel)) expect(iconPaths[cat as keyof typeof iconPaths]?.length).toBeGreaterThan(0);
    for (const d of ["out", "in", "own-transfer", "investment"] as const) expect(iconPaths[d].length).toBeGreaterThan(0);
    expect(Object.keys(iconPaths)).toHaveLength(15);
  });
});
