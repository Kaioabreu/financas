import { describe, expect, it } from "vitest";
import { tabBarMetrics } from "./tabBar";

describe("tabBarMetrics", () => {
  it("adds the bottom inset to the height and padding so the system nav bar never covers the labels", () => {
    const flat = tabBarMetrics(0);
    const buttons = tabBarMetrics(48);
    expect(buttons.height - flat.height).toBe(48);
    expect(buttons.paddingBottom - flat.paddingBottom).toBe(48);
  });

  it("keeps a minimum breathing room with no inset", () => {
    expect(tabBarMetrics(0).paddingBottom).toBeGreaterThan(0);
  });
});
