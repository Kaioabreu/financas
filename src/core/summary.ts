// Core: the monthly view (Resumo and Gastos). A pure function of the stored transactions and
// their classification; nothing is stored, so a change of rule or category shows up at once.
import { cached } from "./dataVersion";
import { bankTransaction } from "../db/schema";
import type { AppCategory, Classification, IncomeOrigin } from "./classification";
import type { CoreDatabase } from "./createCore";
import { buildInstallmentPlan } from "./installments";

export interface Week {
  /** First and last day of the month this week covers (cut at the month's edges). */
  startDay: number;
  endDay: number;
  /** Gastos of the week, with refunds netted out. */
  total: number;
}

export interface MonthSummary {
  /** YYYY-MM. */
  month: string;
  income: { total: number; byOrigin: Record<IncomeOrigin, number> };
  /** Gastos minus every refund received in the month. */
  expenses: number;
  /** Receitas minus gastos (the Saldo do mês). */
  balance: number;
  contributions: number;
  redemptions: number;
  /** Aportes minus resgates; negative means a net redemption. */
  netContribution: number;
  /** Gastos by category, refunds with a category already netted out. Largest first. */
  categories: { category: AppCategory; amount: number }[];
  /** Refunds without a category: they come off the total only. */
  uncategorizedRefunds: number;
  weeks: Week[];
}

export interface MonthPoint {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface SummaryApi {
  monthSummary(month: string): Promise<MonthSummary>;
  /** The `count` months ending at `month`, oldest first. */
  monthHistory(month: string, count?: number): Promise<MonthPoint[]>;
}

interface Deps {
  db: CoreDatabase;
  clock: () => number;
  classify: (ids: string[]) => Promise<Map<string, Classification>>;
}

interface Entry {
  /** YYYY-MM-DD. */
  date: string;
  amount: number;
  c: Classification;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Monday-to-Sunday weeks, cut at the first and last day of the month. */
export function weeksOf(month: string): { startDay: number; endDay: number }[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks: { startDay: number; endDay: number }[] = [];
  let start = 1;
  for (let d = 1; d <= last; d++) {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    if (weekday === 0 || d === last) {
      weeks.push({ startDay: start, endDay: d });
      start = d + 1;
    }
  }
  return weeks;
}

export function createSummary(deps: Deps): SummaryApi {
  /** Everything that counts today: a date still to come only counts when it arrives. */
  function counted(): Promise<Entry[]> {
    const now = new Date(deps.clock());
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return cached(deps.db, `counted:${today}`, () => computeCounted(today));
  }
  async function computeCounted(today: string): Promise<Entry[]> {
    const plan = await buildInstallmentPlan(deps.db);
    const rows = (await deps.db.select().from(bankTransaction))
      .map((r) => ({ ...r, date: plan.dateOf(r.id, r.date) }))
      .filter((r) => r.date <= today);
    const classes = await deps.classify(rows.map((r) => r.id));
    return rows.map((r) => ({
      date: r.date.slice(0, 10),
      amount: Math.abs(r.amountInAccountCurrency ?? r.amount),
      c: classes.get(r.id)!,
    }));
  }

  function summarize(month: string, entries: Entry[]): MonthSummary {
    const inMonth = entries.filter((e) => e.date.startsWith(`${month}-`));
    const byOrigin: Record<IncomeOrigin, number> = { salary: 0, yield: 0, "other-income": 0 };
    const byCategory = new Map<AppCategory, number>();
    let uncategorizedRefunds = 0;
    let contributions = 0;
    let redemptions = 0;
    const weeks = weeksOf(month).map((w) => ({ ...w, total: 0 }));
    const weekOf = (date: string) => {
      const d = Number(date.slice(8, 10));
      return weeks.find((w) => d >= w.startDay && d <= w.endDay)!;
    };

    for (const { date, amount, c } of inMonth) {
      switch (c.nature) {
        case "income":
          byOrigin[c.origin ?? "other-income"] += amount;
          break;
        case "expense":
          byCategory.set(c.category ?? "other", (byCategory.get(c.category ?? "other") ?? 0) + amount);
          weekOf(date).total += amount;
          break;
        case "refund":
          if (c.category) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) - amount);
          else uncategorizedRefunds += amount;
          weekOf(date).total -= amount;
          break;
        case "investment":
          contributions += amount;
          break;
        case "withdrawal":
          redemptions += amount;
          break;
        default:
          break; // own transfer, bill payment and personal loan never count
      }
    }

    const incomeTotal = byOrigin.salary + byOrigin.yield + byOrigin["other-income"];
    const categories = [...byCategory].map(([category, amount]) => ({ category, amount: round(amount) }));
    const expenses = categories.reduce((sum, c) => sum + c.amount, 0) - uncategorizedRefunds;
    return {
      month,
      income: {
        total: round(incomeTotal),
        byOrigin: { salary: round(byOrigin.salary), yield: round(byOrigin.yield), "other-income": round(byOrigin["other-income"]) },
      },
      expenses: round(expenses),
      balance: round(incomeTotal - expenses),
      contributions: round(contributions),
      redemptions: round(redemptions),
      netContribution: round(contributions - redemptions),
      categories: categories.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
      uncategorizedRefunds: round(uncategorizedRefunds),
      weeks: weeks.map((w) => ({ ...w, total: round(w.total) })),
    };
  }

  return {
    async monthSummary(month) {
      return summarize(month, await counted());
    },
    async monthHistory(month, count = 6) {
      const entries = await counted();
      return Array.from({ length: count }, (_, i) => {
        const s = summarize(shiftMonthKey(month, i - count + 1), entries);
        return { month: s.month, income: s.income.total, expenses: s.expenses, balance: s.balance };
      });
    },
  };
}
