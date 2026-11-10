/** Height in px of a bar; any nonzero value gets at least 2 px so it never disappears. */
export function barHeight(value: number, peak: number, max: number): number {
  if (value <= 0 || peak <= 0) return 0;
  return Math.max(2, Math.round((max * value) / peak));
}

/**
 * The last month of the "Seis meses" chart. Choosing a month already in the chart keeps the window
 * where it is (so a tap highlights instead of sliding the bars); one outside it moves the window.
 */
export function chartEnd(end: string | null, chosen: string, windowMonths: string[]): string {
  if (end && windowMonths.includes(chosen)) return end;
  return chosen;
}
