import { createContext, useContext, useState, type ReactNode } from "react";

/** The month chosen at the top (YYYY-MM); shared by every tab. */
const MonthContext = createContext<{
  month: string;
  setMonth: (m: string) => void;
  /** Accounts and cards chosen as the origin of the gastos (shared by Gastos and Transações); empty = all. */
  sources: string[];
  toggleSource: (accountId: string) => void;
} | null>(null);

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return currentMonth(new Date(y, m - 1 + delta, 1));
}
const NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${NAMES[m - 1]} de ${y}`;
}

export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonthState] = useState(currentMonth());
  const [sources, setSources] = useState<string[]>([]);
  // The choice is remembered while going back and forth in the same month; another month starts clean.
  const setMonth = (m: string) => {
    if (m !== month) setSources([]);
    setMonthState(m);
  };
  const toggleSource = (id: string) => setSources((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return <MonthContext.Provider value={{ month, setMonth, sources, toggleSource }}>{children}</MonthContext.Provider>;
}
export function useMonth() {
  const value = useContext(MonthContext);
  if (!value) throw new Error("MonthProvider is missing.");
  return value;
}
