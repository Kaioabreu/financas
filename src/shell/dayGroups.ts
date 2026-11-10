import type { TransactionRow } from "../core/connections";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEK = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "31 out · sábado" for a YYYY-MM-DD date. */
export function dayHeading(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} · ${WEEK[new Date(y, m - 1, d).getDay()]}`;
}

export type ListItem = { kind: "day"; key: string; date: string } | { kind: "row"; key: string; row: TransactionRow };

/** Newest day first; a day heading precedes its rows. */
export function withDayHeadings(rows: TransactionRow[]): ListItem[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const out: ListItem[] = [];
  let last = "";
  for (const row of sorted) {
    if (row.date !== last) {
      out.push({ kind: "day", key: `d${row.date}`, date: row.date });
      last = row.date;
    }
    out.push({ kind: "row", key: row.id, row });
  }
  return out;
}
