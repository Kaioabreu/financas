// Core: the estimate of the 12 months before the first read of each Connection.
// It runs once per Connection, never again ("renovar não refaz"), and writes Retratos marked
// `estimated`. Accounts are exact (current balance minus the transactions, day by day), indexed
// fixed income grows with the CDI/IPCA series of the Banco Central (SGS) and everything else
// follows a straight line through the prices the operations tell. Everything is calibrated so the
// last estimated day meets the position of the first read.
import { eq, inArray } from "drizzle-orm";
import { account, appMeta, bankTransaction, bill, connection, investment, investmentTransaction, snapshot } from "../db/schema";
import type { CoreDatabase } from "./createCore";
import { createFundQuotas, normalizeCnpj, quotaPath, QuotaSourceError, type FundQuotas, type NetworkKind } from "./fundQuotas";
import { classOfInvestment, localDay, type Line } from "./networth";

export const SGS_BASE = "https://api.bcb.gov.br/dados/serie";
/** How long a pending estimate keeps retrying before it closes with the straight line. */
export const ESTIMATE_RETRY_MS = 7 * 86_400_000;

export interface EstimateState {
  state: "pending" | "closed";
  /** Attempts made so far (the one that closed it included). */
  attempts: number;
  startedAt: number;
  /** YYYY-MM-DD: the first day the Connection was read; the estimate covers the 12 months before it. */
  firstDay: string;
  /** The source that failed on the last attempt ("SGS 12"). */
  failedSource: string | null;
  /** Closed after 7 days with a source still down: the assets that needed it follow the straight line. */
  closedWithStraightLine: boolean;
  /** The fund quotas wait for the user to allow the download on mobile data. */
  awaitingLicense?: boolean;
}

interface Deps {
  db: CoreDatabase;
  fetch: typeof fetch;
  clock: () => number;
  network?: () => Promise<NetworkKind>;
}

type Account = typeof account.$inferSelect;
type Tx = typeof bankTransaction.$inferSelect;
type Bill = typeof bill.$inferSelect;
type Investment = typeof investment.$inferSelect;
type Operation = typeof investmentTransaction.$inferSelect;
type Series = Map<string, number>;

const DAY = 86_400_000;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const parse = (text: string | null): any => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};
const round = (v: number) => Math.round(v * 100) / 100;
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => toDay(dayMs(day) + n * DAY);
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const sgsDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const fromSgsDate = (text: unknown) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(typeof text === "string" ? text : "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const startOf = (extra: any): string | null => {
  const raw = extra?.issueDate ?? extra?.purchaseDate;
  return typeof raw === "string" && raw.length >= 10 ? raw.slice(0, 10) : null;
};

class SourceFailed extends Error {
  constructor(readonly source: string) {
    super(source);
  }
}

interface Indexing {
  kind: "cdi" | "ipca" | "pre";
  /** % of the CDI (CDI only). */
  rate: number;
  /** Annual spread over the CDI or the IPCA, or the annual fixed rate. */
  spread: number;
}

function indexingOf(inv: Investment, extra: any): Indexing | null {
  if (inv.type !== "FIXED_INCOME" || inv.subtype === "TREASURY") return null; // Treasury prices: a later ticket
  if (!(num(inv.amountOriginal) > 0) || !startOf(extra)) return null;
  const type = String(extra.rateType ?? "").toUpperCase();
  const rate = num(extra.rate);
  const fixed = num(extra.fixedAnnualRate);
  if (type.includes("CDI")) return { kind: "cdi", rate: rate || 100, spread: fixed };
  if (type.includes("IPCA")) return { kind: "ipca", rate: 0, spread: fixed || rate };
  if (type.includes("PRE")) return { kind: "pre", rate: 0, spread: fixed || rate };
  return null;
}

export function createEstimate(deps: Deps) {
  const { db } = deps;
  const fundQuotas = createFundQuotas({ db, fetch: deps.fetch, network: deps.network });

  async function readMeta(key: string): Promise<string | null> {
    return (await db.select().from(appMeta).where(eq(appMeta.key, key)))[0]?.value ?? null;
  }
  async function writeMeta(key: string, value: string) {
    await db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
  }

  /** One SGS series for [from, to], from the cache when it covers the window. Fields are read by name. */
  async function series(code: number, from: string, to: string): Promise<Series> {
    const key = `cache.sgs.${code}`;
    const cached = parse(await readMeta(key));
    if (cached.from && cached.from <= from && cached.to >= to && Array.isArray(cached.values)) return new Map<string, number>(cached.values);
    const source = `SGS ${code}`;
    let rows: unknown;
    try {
      const response = await deps.fetch(`${SGS_BASE}/bcdata.sgs.${code}/dados?formato=json&dataInicial=${sgsDate(from)}&dataFinal=${sgsDate(to)}`);
      if (response.status !== 200) throw new SourceFailed(source);
      rows = await response.json();
    } catch {
      throw new SourceFailed(source);
    }
    if (!Array.isArray(rows)) throw new SourceFailed(source);
    const values = new Map<string, number>();
    for (const row of rows as { data?: unknown; valor?: unknown }[]) {
      const day = fromSgsDate(row?.data);
      const value = Number(String(row?.valor ?? "").replace(",", "."));
      if (day && Number.isFinite(value)) values.set(day, value);
    }
    await writeMeta(key, JSON.stringify({ from, to, values: [...values] }));
    return values;
  }

  /** Runs (or retries) the estimate of one Connection. Never throws. */
  async function run(itemId: string): Promise<void> {
    try {
      await attempt(itemId);
    } catch {
      /* the estimate must never break a sync; it stays as it was and is tried again */
    }
  }

  async function attempt(itemId: string) {
    const [conn] = await db.select().from(connection).where(eq(connection.itemId, itemId));
    if (!conn) return;
    let state: EstimateState | null = conn.estimate ? (JSON.parse(conn.estimate) as EstimateState) : null;
    if (state?.state === "closed") return;

    const snaps = await db.select().from(snapshot).where(eq(snapshot.itemId, itemId));
    const real = snaps.filter((s) => parse(s.payload).estimated !== true).sort((a, b) => a.date.localeCompare(b.date));
    if (!state) {
      if (!real[0]) return; // nothing was read yet
      state = { state: "pending", attempts: 0, startedAt: deps.clock(), firstDay: real[0].date, failedSource: null, closedWithStraightLine: false };
    }
    const baseline = real.find((s) => s.date === state!.firstDay);
    if (!baseline) return;
    const current = state;
    const save = () => db.update(connection).set({ estimate: JSON.stringify(current) }).where(eq(connection.itemId, itemId));

    const D = current.firstDay;
    const W = toDay(Date.UTC(Number(D.slice(0, 4)) - 1, Number(D.slice(5, 7)) - 1, Number(D.slice(8, 10))));
    current.attempts += 1;

    // ---- what the Connection holds ----
    const accounts = await db.select().from(account).where(eq(account.itemId, itemId));
    const accountIds = accounts.map((a) => a.id);
    const txs = accountIds.length ? await db.select().from(bankTransaction).where(inArray(bankTransaction.accountId, accountIds)) : [];
    const bills = accountIds.length ? await db.select().from(bill).where(inArray(bill.accountId, accountIds)) : [];
    const investments = await db.select().from(investment).where(eq(investment.itemId, itemId));
    const ops = investments.length
      ? await db.select().from(investmentTransaction).where(inArray(investmentTransaction.investmentId, investments.map((i) => i.id)))
      : [];

    // ---- the sources the indexed fixed income needs ----
    const indexings = new Map(investments.map((i) => [i.id, indexingOf(i, parse(i.extra))]));
    const kinds = new Set([...indexings.values()].filter((x): x is Indexing => x !== null).map((x) => x.kind));
    const sources: { cdi: Series | null; ipca: Series | null; failed: string | null } = { cdi: null, ipca: null, failed: null };
    const load = async (job: () => Promise<void>) => {
      try {
        await job();
      } catch (error) {
        sources.failed = error instanceof SourceFailed || error instanceof QuotaSourceError ? error.source : "fonte";
      }
    };
    if (kinds.has("cdi")) await load(async () => void (sources.cdi = await series(12, W, D)));
    if (kinds.has("ipca")) {
      await load(async () => {
        const monthStart = `${W.slice(0, 7)}-01`;
        const main = await series(433, monthStart, D);
        const preview = await series(7478, monthStart, D);
        const merged: Series = new Map();
        for (const [d, v] of preview) merged.set(d.slice(0, 7), v);
        for (const [d, v] of main) merged.set(d.slice(0, 7), v); // the IPCA wins; the IPCA-15 fills the month without it
        sources.ipca = merged;
      });
    }
    // ---- the fund quotas (CVM) ----
    let quotas: FundQuotas = { byCnpj: new Map() };
    current.awaitingLicense = false;
    const cnpjOf = (inv: Investment) => (inv.type === "MUTUAL_FUND" ? (normalizeCnpj(parse(inv.extra).code) ?? normalizeCnpj(parse(inv.extra).issuerCNPJ)) : null);
    const fundCnpjs = [...new Set(investments.map(cnpjOf).filter((c): c is string => c !== null))];
    await load(async () => {
      try {
        quotas = await fundQuotas.load(fundCnpjs, W, D);
      } catch (error) {
        if (error instanceof QuotaSourceError) current.awaitingLicense = error.waiting;
        throw error;
      }
    });
    current.failedSource = sources.failed;
    if (sources.failed && deps.clock() - current.startedAt < ESTIMATE_RETRY_MS) {
      await save(); // pending: tried again on the next sync
      return;
    }

    // ---- day by day ----
    const today = localDay(deps.clock());
    const days: string[] = [];
    for (let d = W; d < D; d = addDays(d, 1)) days.push(d);

    const cash = cashPath(accounts, txs, today, [...days, D]);
    const debts = debtPath(accounts, bills, txs, [...days, D]);
    const assets = investments.map((inv) => {
      const extra = parse(inv.extra);
      const idx = indexings.get(inv.id);
      const cnpj = cnpjOf(inv);
      const fund = cnpj ? quotaPath(quotas.byCnpj.get(cnpj) ?? new Map(), num(extra.amountWithdrawal ?? inv.balance), fundPosition(inv, extra, ops.filter((o) => o.investmentId === inv.id)), D, days) : null;
      if (fund) return { cls: classOfInvestment(inv.type), values: fund };
      const usable = idx && (idx.kind === "pre" || (idx.kind === "cdi" && sources.cdi) || (idx.kind === "ipca" && sources.ipca));
      return {
        cls: classOfInvestment(inv.type),
        values: usable
          ? indexedPath(inv, extra, idx, sources.cdi, sources.ipca, W, D, days)
          : straightPath(inv, extra, ops.filter((o) => o.investmentId === inv.id), D, days),
      };
    });

    // Calibration: cash and debt meet the first read exactly (assets are scaled one by one).
    const realLines: Line[] = parse(baseline.payload).lines ?? [];
    const realSum = (cls: Line["cls"]) => realLines.filter((l) => l.cls === cls).reduce((s, l) => s + l.value, 0);
    const cashShift = realSum("cash") - cash.cash[D]!;
    const debtShift = realSum("debt") - (debts[D]! + cash.heldDebt);

    const rows = days.map((day) => {
      const sums = new Map<Line["cls"], number>();
      const add = (cls: Line["cls"], v: number) => sums.set(cls, (sums.get(cls) ?? 0) + v);
      add("cash", Math.max(0, cash.cash[day]! + cashShift));
      const debt = Math.min(0, debts[day]! + cash.heldDebt + debtShift);
      if (debt !== 0) add("debt", debt);
      if (cash.heldReserved) add("fixedIncome", cash.heldReserved);
      for (const a of assets) if (a.values[day]) add(a.cls, a.values[day]!);
      const lines: Line[] = [...sums].map(([cls, value]) => ({ cls, value: round(value) }));
      return { date: day, itemId, payload: JSON.stringify({ lines, unavailable: false, estimated: true }) };
    });
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(snapshot).values(rows.slice(i, i + 100)).onConflictDoNothing();
    }
    current.state = "closed";
    current.closedWithStraightLine = Boolean(sources.failed);
    await save();
  }

  /** A pending estimate waits for the licence and the user has not chosen yet. */
  async function fundQuotasPrompt(): Promise<boolean> {
    if (await fundQuotas.choice()) return false;
    const rows = await db.select().from(connection);
    return rows.some((r) => {
      const e: EstimateState | null = r.estimate ? JSON.parse(r.estimate) : null;
      return e?.state === "pending" && e.awaitingLicense === true;
    });
  }

  async function answerFundQuotas(choice: "download" | "wait") {
    await fundQuotas.setChoice(choice);
    if (choice !== "download") return;
    for (const r of await db.select().from(connection)) if (r.estimate) await run(r.itemId);
  }

  return { run, fundQuotasPrompt, answerFundQuotas };
}

// ---------------------------------------------------------------- accounts

/** Signed effect of a transaction on its account. */
function effect(t: Tx): number {
  const amount = t.amountInAccountCurrency ?? t.amount;
  const credit = t.type ? t.type === "CREDIT" : amount < 0;
  return credit ? Math.abs(amount) : -Math.abs(amount);
}

/**
 * Cash at the end of each day: the current balance minus the transactions after it.
 * The reserved balances and the overdraft are held at today's value (they have no history).
 * `days` ends with the first-read day.
 */
function cashPath(accounts: Account[], txs: Tx[], today: string, days: string[]) {
  const cash: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  let heldReserved = 0;
  let heldDebt = 0;
  const last = days[days.length - 1]!;
  for (const a of accounts) {
    if (a.type === "CREDIT") continue;
    const extra = parse(a.extra);
    const reserved: any[] = Array.isArray(extra.reservedBalances) ? extra.reservedBalances : [];
    for (const r of reserved) heldReserved += num(r?.amount ?? r?.balance ?? r?.value);
    heldDebt -= Math.max(0, num(extra.bankData?.overdraftUsedLimit));
    const byDay = new Map<string, number>();
    for (const t of txs) if (t.accountId === a.id) byDay.set(t.date.slice(0, 10), (byDay.get(t.date.slice(0, 10)) ?? 0) + effect(t));
    // What came after the first read, up to today, is not in the balance of that day.
    let after = 0;
    for (const [d, v] of byDay) if (d > last && d <= today) after += v;
    for (let i = days.length - 1; i >= 0; i--) {
      const day = days[i]!;
      cash[day] = cash[day]! + Math.max(0, num(a.balance) - after);
      after += byDay.get(day) ?? 0; // the day itself still counts for the day before
    }
  }
  return { cash, heldReserved, heldDebt };
}

/** Card debt (negative) at the end of each day: purchases posted and not in a bill paid by then. */
function debtPath(accounts: Account[], bills: Bill[], txs: Tx[], days: string[]) {
  const out: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  for (const a of accounts) {
    if (a.type !== "CREDIT") continue;
    const paidAt = new Map<string, string>();
    for (const b of bills.filter((x) => x.accountId === a.id)) {
      const payments = parse(b.extra).payments;
      if (Array.isArray(payments)) {
        const sum = payments.reduce((s: number, p: any) => s + num(p?.amount), 0);
        if (sum > 0 && sum >= num(b.totalAmount) - 0.005) paidAt.set(b.id, b.dueDate.slice(0, 10));
      } else paidAt.set(b.id, b.dueDate.slice(0, 10));
    }
    const mine = txs.filter((t) => t.accountId === a.id);
    for (const day of days) {
      let owed = 0;
      for (const t of mine) {
        if (t.date.slice(0, 10) > day) continue;
        const billId = parse(t.extra).creditCardMetadata?.billId;
        if (billId && (paidAt.get(billId) ?? "9999") <= day) continue;
        owed -= effect(t); // a charge (a debit) adds to the debt
      }
      out[day] = out[day]! - Math.max(0, owed);
    }
  }
  return out;
}

// ------------------------------------------------------------- investments

/** Fixed income that grows with the CDI, the IPCA or a fixed rate, calibrated to the value of the first read. */
function indexedPath(inv: Investment, extra: any, idx: Indexing, cdi: Series | null, ipca: Series | null, W: string, D: string, days: string[]) {
  const target = num(extra.amountWithdrawal ?? inv.balance);
  const start = startOf(extra)!;
  // Cumulative growth G(day) from W; the value at X is target * G(X) / G(D).
  const G: Record<string, number> = { [W]: 1 };
  let g = 1;
  for (let d = addDays(W, 1); d <= D; d = addDays(d, 1)) {
    let f = 1;
    if (idx.kind === "cdi") {
      const r = cdi?.get(d); // only business days have a rate
      if (r !== undefined) f = (1 + (r / 100) * (idx.rate / 100)) * (idx.spread > 0 ? (1 + idx.spread / 100) ** (1 / 252) : 1);
    } else if (idx.kind === "ipca") {
      const month = d.slice(0, 7);
      f = (1 + (ipca?.get(month) ?? 0) / 100) ** (1 / daysIn(month)) * (1 + idx.spread / 100) ** (1 / 365);
    } else f = (1 + idx.spread / 100) ** (1 / 365);
    g *= f;
    G[d] = g;
  }
  const out: Record<string, number> = {};
  for (const day of days) out[day] = day < start ? 0 : (target * G[day]!) / G[D]!;
  return out;
}

/** Quantity times price, the price on a straight line through the prices the operations tell. */
function straightPath(inv: Investment, extra: any, rows: Operation[], D: string, days: string[]) {
  const target = num(extra.amountWithdrawal ?? inv.balance);
  // Operations without a quantity are left out of the quantity.
  const sized = rows
    .filter((o) => (o.type === "BUY" || o.type === "SELL") && num(o.quantity) > 0)
    .map((o) => ({ date: o.date.slice(0, 10), qty: (o.type === "BUY" ? 1 : -1) * num(o.quantity), price: num(o.value) }));
  const unit = num(extra.value);
  const qNow = num(extra.quantity) > 0 ? num(extra.quantity) : unit > 0 && num(inv.balance) > 0 ? num(inv.balance) / unit : 1;
  const pNow = unit > 0 ? unit : num(inv.balance) / qNow;
  const qAt = (day: string) => Math.max(0, qNow - sized.filter((o) => o.date > day).reduce((s, o) => s + o.qty, 0));
  const start = startOf(extra);

  const points = new Map<string, number>();
  for (const o of sized) if (o.price > 0) points.set(o.date, o.price);
  if (start && num(inv.amountOriginal) > 0) points.set(start, num(inv.amountOriginal) / (qAt(start) > 0 ? qAt(start) : qNow));
  points.set(D, pNow);
  const line = [...points].sort(([a], [b]) => a.localeCompare(b));
  const priceAt = (day: string) => {
    if (day <= line[0]![0]) return line[0]![1]; // before the first point the price stays on it
    for (let i = 1; i < line.length; i++) {
      const [d1, p1] = line[i]!;
      if (day <= d1) {
        const [d0, p0] = line[i - 1]!;
        return p0 + ((p1 - p0) * (dayMs(day) - dayMs(d0))) / (dayMs(d1) - dayMs(d0));
      }
    }
    return line[line.length - 1]![1];
  };

  const atD = qAt(D) * priceAt(D);
  const k = atD > 0 && target > 0 ? target / atD : 1;
  const out: Record<string, number> = {};
  for (const day of days) {
    const existed = sized.length > 0 || !start || day >= start;
    out[day] = existed ? qAt(day) * priceAt(day) * k : 0;
  }
  return out;
}

/** What the quota path needs of a fund: the quantity now, the operations that changed it and the purchase day. */
function fundPosition(inv: Investment, extra: any, rows: Operation[]) {
  const qtyNow = num(extra.quantity) > 0 ? num(extra.quantity) : 1;
  const ops =
    num(extra.quantity) > 0
      ? rows.filter((o) => (o.type === "BUY" || o.type === "SELL") && num(o.quantity) > 0).map((o) => ({ date: o.date.slice(0, 10), qty: (o.type === "BUY" ? 1 : -1) * num(o.quantity) }))
      : [];
  return { qtyNow, ops, start: startOf(extra) };
}
