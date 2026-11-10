import { describe, expect, it } from "vitest";
import { CHANNEL_HEADER, TAPS_TO_TOGGLE, formatUpdateLine, nextChannel, registerTap, type TapState } from "./canary";

function tapN(n: number, start: TapState = { count: 0, lastAt: 0 }, t0 = 1000, gap = 300) {
  let state = start;
  let toggled = false;
  for (let i = 0; i < n; i++) ({ state, toggled } = registerTap(state, t0 + i * gap));
  return { state, toggled };
}

describe("registerTap", () => {
  it("toggles on the seventh quick tap and starts over", () => {
    expect(TAPS_TO_TOGGLE).toBe(7);
    expect(tapN(6).toggled).toBe(false);
    const seven = tapN(7);
    expect(seven.toggled).toBe(true);
    expect(seven.state.count).toBe(0);
  });

  it("forgets earlier taps after a pause", () => {
    const first = tapN(5).state;
    const { state } = registerTap(first, first.lastAt + 5000);
    expect(state.count).toBe(1);
  });

  it("toggles again after another seven taps", () => {
    const afterFirst = tapN(7).state;
    expect(tapN(7, afterFirst, 20000).toggled).toBe(true);
  });
});

describe("nextChannel", () => {
  it("flips between production and preview", () => {
    expect(nextChannel("production")).toBe("preview");
    expect(nextChannel("preview")).toBe("production");
    expect(nextChannel(null)).toBe("preview");
  });
  it("uses the EAS channel header name", () => {
    expect(CHANNEL_HEADER).toBe("expo-channel-name");
  });
});

describe("formatUpdateLine", () => {
  it("shows the version and the OTA date", () => {
    expect(formatUpdateLine("1.0.0", new Date(2026, 10, 9, 12), null)).toBe("Versão 1.0.0 · atualizado em 09/11/2026");
  });
  it("says so when running the embedded bundle", () => {
    expect(formatUpdateLine("1.0.0", null, null)).toBe("Versão 1.0.0 · versão embutida, sem atualização");
  });
  it("marks the preview channel", () => {
    expect(formatUpdateLine("1.0.0", null, "preview")).toBe("Versão 1.0.0 · versão embutida, sem atualização · canal preview");
  });
});
