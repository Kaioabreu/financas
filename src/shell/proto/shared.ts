// PROTOTYPE (branch prototype/transacoes-linhas): throwaway helpers shared by the three variants.
import type { ReactElement, ReactNode } from "react";
import type { RefreshControlProps } from "react-native";
import type { AccountSummary, TransactionRow } from "../../core/connections";
import type { AppCategory } from "../../core/classification";

export const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Module-level so the choice survives leaving and coming back to the tab. */
let current = 0;
export const getVariant = () => current;
export const setVariant = (i: number) => {
  current = i;
};

export interface TxProps {
  rows: TransactionRow[];
  accounts: AccountSummary[];
  sources: string[];
  toggleSource: (id: string) => void;
  category?: AppCategory;
  days?: { from: number; to: number };
  clearFilter: () => void;
  onEdit: (row: TransactionRow) => void;
  onRules: () => void;
  refreshControl: ReactElement<RefreshControlProps>;
  /** Gaps, data-from, notices, CPF link: the existing banners, kept as they are. */
  banners: ReactNode;
  emptyText: string;
  /** Room for the floating switcher at the bottom. */
  bottomPad: number;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEK = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "31 out" */
export function shortDay(date: string): string {
  const [, m, d] = date.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}
/** "sábado" */
export function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return WEEK[new Date(y, m - 1, d).getDay()]!;
}

export interface DayGroup {
  date: string;
  total: number;
  data: TransactionRow[];
}
/** Rows are grouped in the order they arrive, newest day first. */
export function groupByDay(rows: TransactionRow[]): DayGroup[] {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const out: DayGroup[] = [];
  for (const r of sorted) {
    let g = out[out.length - 1];
    if (!g || g.date !== r.date) {
      g = { date: r.date, total: 0, data: [] };
      out.push(g);
    }
    g.data.push(r);
    g.total += r.amount;
  }
  return out;
}
