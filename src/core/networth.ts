// Core: the Patrimônio. caixa + carteira − dívidas, as far as the app sees.
// A Retrato (snapshot) is stored per Connection and per day by the sync; the total for today is
// computed live from the mirrored data, so a Conexão vencida keeps counting with its last Retrato.
import { and, desc, eq, lte } from "drizzle-orm";
import { account, bankTransaction, bill, connection, investment, snapshot } from "../db/schema";
import { isExpired } from "./connections";
import type { CoreDatabase } from "./createCore";
import { buildInstallmentPlan } from "./installments";

export type AssetClass = "cash" | "fixedIncome" | "equity" | "funds" | "other";
export const ASSET_CLASSES: AssetClass[] = ["cash", "fixedIncome", "equity", "funds", "other"];

/** One value of a Retrato: an asset in its class, or a debt as a negative value. */
export interface Line {
  cls: AssetClass | "debt";
  value: number;
}

export interface NetWorthClass {
  class: AssetClass;
  value: number;
  /** Share of the assets (0-1). */
  share: number;
}
export interface CurvePoint {
  /** YYYY-MM. */
  month: string;
  /** YYYY-MM-DD of the Retrato (today for the last point). */
  date: string;
  total: number;
  today: boolean;
}
export interface NetWorthBank {
  itemId: string;
  bankName: string;
  /** YYYY-MM-DD: set when the bank counts with an old Retrato ("valor de dd/mm"). */
  valueDate: string | null;
  /** Pluggy signalled something this bank may not be sharing ("pode faltar"). */
  mayBeMissing: boolean;
}
export interface NetWorthView {
  total: number;
  /** Today minus the last month's point; null when there is none. */
  variation: number | null;
  classes: NetWorthClass[];
  /** Negative; 0 when there is no debt. */
  debt: number;
  curve: CurvePoint[];
  banks: NetWorthBank[];
}

export interface NetWorthApi {
  netWorth(): Promise<NetWorthView>;
}

interface Deps {
  db: CoreDatabase;
  clock: () => number;
}

const round = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const parse = (text: string | null): any => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function classOfInvestment(type: string | null): AssetClass {
  switch (type) {
    case "FIXED_INCOME":
      return "fixedIncome";
    case "EQUITY":
    case "ETF":
      return "equity";
    case "MUTUAL_FUND":
      return "funds";
    default:
      return "other";
  }
}

export function createNetWorth(deps: Deps) {
  const { db } = deps;

  /** What one Connection is worth today, from the mirrored data. */
  async function liveLines(itemId: string, today: string): Promise<{ lines: Line[]; reservedMissing: boolean }> {
    const lines: Line[] = [];
    let reservedMissing = false;
    const accounts = await db.select().from(account).where(eq(account.itemId, itemId));

    for (const a of accounts) {
      const extra = parse(a.extra);
      if (a.type !== "CREDIT") {
        lines.push({ cls: "cash", value: Math.max(0, num(a.balance)) });
        const reserved: any[] = Array.isArray(extra.reservedBalances) ? extra.reservedBalances : [];
        for (const r of reserved) lines.push({ cls: "fixedIncome", value: num(r?.amount ?? r?.balance ?? r?.value) });
        if (extra.bankData?.hasReservedBalance === true && reserved.length === 0) reservedMissing = true;
        const overdraft = num(extra.bankData?.overdraftUsedLimit);
        if (overdraft > 0) lines.push({ cls: "debt", value: -overdraft });
      } else {
        const owed = await cardDebt(a.id, today);
        if (owed > 0) lines.push({ cls: "debt", value: -owed });
      }
    }

    for (const i of await db.select().from(investment).where(eq(investment.itemId, itemId))) {
      const extra = parse(i.extra);
      lines.push({ cls: classOfInvestment(i.type), value: num(extra.amountWithdrawal ?? i.balance) });
    }
    return { lines: lines.map((l) => ({ ...l, value: round(l.value) })), reservedMissing };
  }

  /** Card purchases already posted (date up to today) whose bill is not paid yet, net of credits. */
  async function cardDebt(accountId: string, today: string): Promise<number> {
    const bills = await db.select().from(bill).where(eq(bill.accountId, accountId));
    const paid = new Set<string>();
    for (const b of bills) {
      const payments = parse(b.extra).payments;
      if (Array.isArray(payments)) {
        const sum = payments.reduce((s: number, p: any) => s + num(p?.amount), 0);
        if (sum > 0 && sum >= num(b.totalAmount) - 0.005) paid.add(b.id);
      } else if (b.dueDate.slice(0, 10) < today) {
        paid.add(b.id); // Pluggy did not report payments: a bill past its due date is taken as paid
      }
    }
    const plan = await buildInstallmentPlan(db);
    let owed = 0;
    for (const t of await db.select().from(bankTransaction).where(eq(bankTransaction.accountId, accountId))) {
      if (plan.dateOf(t.id, t.date) > today) continue;
      const billId = plan.byId.get(t.id)?.billId ?? parse(t.extra).creditCardMetadata?.billId;
      if (billId && paid.has(billId)) continue;
      const amount = t.amountInAccountCurrency ?? t.amount;
      const credit = t.type ? t.type === "CREDIT" : amount < 0;
      owed += credit ? -Math.abs(amount) : Math.abs(amount);
    }
    return Math.max(0, owed);
  }

  async function allSnapshots() {
    return (await db.select().from(snapshot)).map((r) => ({
      date: r.date,
      itemId: r.itemId,
      ...(parse(r.payload) as { lines?: Line[]; unavailable?: boolean }),
    }));
  }

  return {
    /** Writes the Retrato of one Connection for today; a later one the same day replaces it. */
    async takeSnapshot(itemId: string, unavailable: boolean) {
      const date = localDay(deps.clock());
      const { lines, reservedMissing } = await liveLines(itemId, date);
      const payload = JSON.stringify({ lines, unavailable: unavailable || reservedMissing });
      await db.insert(snapshot).values({ date, itemId, payload }).onConflictDoUpdate({ target: [snapshot.date, snapshot.itemId], set: { payload } });
    },

    async netWorth(): Promise<NetWorthView> {
      const now = deps.clock();
      const today = localDay(now);
      const conns = await db.select().from(connection);
      const snaps = await allSnapshots();

      const byClass = new Map<AssetClass, number>();
      let debt = 0;
      const banks: NetWorthBank[] = [];
      for (const c of conns) {
        const last = await db
          .select()
          .from(snapshot)
          .where(and(eq(snapshot.itemId, c.itemId), lte(snapshot.date, today)))
          .orderBy(desc(snapshot.date))
          .limit(1);
        const old = last[0];
        const expired = isExpired(c.consentExpiresAt, now);
        let lines: Line[];
        let mayBeMissing: boolean;
        let valueDate: string | null = null;
        if (expired && old) {
          lines = parse(old.payload).lines ?? [];
          mayBeMissing = parse(old.payload).unavailable === true;
          valueDate = old.date;
        } else {
          const live = await liveLines(c.itemId, today);
          lines = live.lines;
          mayBeMissing = live.reservedMissing || (old ? parse(old.payload).unavailable === true : false);
          if (expired) valueDate = c.dataAt ? c.dataAt.slice(0, 10) : null;
        }
        for (const l of lines) {
          if (l.cls === "debt") debt += l.value;
          else byClass.set(l.cls, (byClass.get(l.cls) ?? 0) + l.value);
        }
        banks.push({ itemId: c.itemId, bankName: c.bankName, valueDate, mayBeMissing });
      }

      const assets = ASSET_CLASSES.reduce((s, k) => s + (byClass.get(k) ?? 0), 0);
      const classes = ASSET_CLASSES.filter((k) => (byClass.get(k) ?? 0) !== 0).map((k) => ({
        class: k,
        value: round(byClass.get(k)!),
        share: assets > 0 ? byClass.get(k)! / assets : 0,
      }));
      const total = round(assets + debt);

      // The curve: the last Retrato of each month before this one, then today.
      const thisMonth = today.slice(0, 7);
      const totalAt = (date: string) => {
        const latest = new Map<string, { date: string; lines: Line[] }>();
        for (const s of snaps) {
          if (s.date > date) continue;
          const cur = latest.get(s.itemId);
          if (!cur || s.date > cur.date) latest.set(s.itemId, { date: s.date, lines: s.lines ?? [] });
        }
        let sum = 0;
        for (const { lines } of latest.values()) for (const l of lines) sum += l.value;
        return round(sum);
      };
      const lastDayOfMonth = new Map<string, string>();
      for (const s of snaps) {
        const month = s.date.slice(0, 7);
        if (month >= thisMonth) continue;
        if (!lastDayOfMonth.has(month) || s.date > lastDayOfMonth.get(month)!) lastDayOfMonth.set(month, s.date);
      }
      const curve: CurvePoint[] = [...lastDayOfMonth]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, date]) => ({ month, date, total: totalAt(date), today: false }));
      const previous = curve[curve.length - 1];
      curve.push({ month: thisMonth, date: today, total, today: true });

      return { total, variation: previous ? round(total - previous.total) : null, classes, debt: round(debt), curve, banks };
    },
  };
}
