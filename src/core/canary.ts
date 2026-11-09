// Canary switch: seven quick taps on the version flip this phone between the
// "production" and "preview" EAS Update channels. Pure logic; the native call lives in the shell.
export const CHANNEL_HEADER = "expo-channel-name";
export const TAPS_TO_TOGGLE = 7;
const MAX_GAP_MS = 2000;

export type Channel = "production" | "preview";
export interface TapState {
  count: number;
  lastAt: number;
}

export function registerTap(state: TapState, now: number): { state: TapState; toggled: boolean } {
  const count = state.count > 0 && now - state.lastAt <= MAX_GAP_MS ? state.count + 1 : 1;
  if (count >= TAPS_TO_TOGGLE) return { state: { count: 0, lastAt: now }, toggled: true };
  return { state: { count, lastAt: now }, toggled: false };
}

export function nextChannel(current: string | null): Channel {
  return current === "preview" ? "production" : "preview";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatUpdateLine(version: string, otaDate: Date | null, channel: string | null): string {
  const update = otaDate
    ? `atualizado em ${pad(otaDate.getDate())}/${pad(otaDate.getMonth() + 1)}/${otaDate.getFullYear()}`
    : "versão embutida, sem atualização";
  const tail = channel === "preview" ? " · canal preview" : "";
  return `Versão ${version} · ${update}${tail}`;
}
