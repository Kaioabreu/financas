import { describe, expect, it } from "vitest";
import { barHeight, chartEnd } from "./sixMonths";

describe("barHeight", () => {
  it("scales to the peak and never hides a nonzero value", () => {
    expect(barHeight(500, 1000, 100)).toBe(50);
    expect(barHeight(1, 1000000, 100)).toBe(2);
  });
  it("is flat for zero", () => {
    expect(barHeight(0, 1000, 100)).toBe(0);
    expect(barHeight(0, 0, 100)).toBe(0);
  });
});

describe("chartEnd", () => {
  const window = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  it("keeps the window when the chosen month is inside it, so tapping a bar does not slide the chart", () => {
    expect(chartEnd("2026-11", "2026-10", window)).toBe("2026-11");
  });
  it("moves the window to the chosen month when it falls outside", () => {
    expect(chartEnd("2026-11", "2026-03", window)).toBe("2026-03");
  });
  it("starts at the chosen month when there is no window yet", () => {
    expect(chartEnd(null, "2026-10", [])).toBe("2026-10");
  });
});
