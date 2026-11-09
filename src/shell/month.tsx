import { createContext, useContext, useState, type ReactNode } from "react";

/** The month chosen at the top (YYYY-MM); shared by every tab. */
const MonthContext = createContext<{ month: string; setMonth: (m: string) => void } | null>(null);

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
  const [month, setMonth] = useState(currentMonth());
  return <MonthContext.Provider value={{ month, setMonth }}>{children}</MonthContext.Provider>;
}
export function useMonth() {
  const value = useContext(MonthContext);
  if (!value) throw new Error("MonthProvider is missing.");
  return value;
}
