// Core: the sync. Reads a Connection whole from Pluggy, then mirrors it into the local
// database in one database transaction (all or nothing).
import { eq, inArray, sql } from "drizzle-orm";
import {
  account,
  bankTransaction,
  bill,
  connection,
  identity,
  investment,
  investmentTransaction,
} from "../db/schema";
import type { EmbeddedConfig } from "./config";
import { isExpired } from "./connections";
import type { CoreDatabase } from "./createCore";

export interface SyncNotice {
  itemId: string;
  message: string;
}
export interface SyncReport {
  /** Connections that failed this round. Filled only for a manual sync (pull to refresh). */
  notices: SyncNotice[];
}
export interface MirrorCounts {
  transactions: number;
  bills: number;
  investments: number;
  investmentTransactions: number;
  identities: number;
}

export interface SyncApi {
  /** Full read of one Connection (used right after connecting). Never throws; sets readState. */
  readConnection(itemId: string): Promise<void>;
  /** Restarts the read of Connections left in "reading" (app closed mid-read). */
  resumeReads(): Promise<void>;
  /** On open (`manual: false`) and on pull to refresh (`manual: true`). */
  sync(options: { manual: boolean }): Promise<SyncReport>;
  /** How many rows of each mirrored product the app holds. */
  mirrorCounts(): Promise<MirrorCounts>;
}

interface Deps {
  db: CoreDatabase;
  config: EmbeddedConfig;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  request: (method: string, path: string, body?: unknown) => Promise<Response>;
  /** The lock held back a read: the biggest share of a product it would have deleted (0-100). */
  onLock?: (itemId: string, percent: number) => Promise<void>;
  /** Told which transactions appeared in a read, so hand edits can follow recreated ones. */
  moveEdits?: (newIds: string[]) => Promise<void>;
  /** True while Pluggy refuses the credentials: nothing syncs. */
  credentialsRefused?: () => Promise<boolean>;
  /** Writes the Retrato of the Connection for today; `unavailable` when Pluggy flagged a resource. */
  takeSnapshot?: (itemId: string, unavailable: boolean) => Promise<void>;
  /** Runs or retries the estimate of the 12 months before the first read; never throws. */
  estimate?: (itemId: string) => Promise<void>;
}

type Product = "accounts" | "creditCards" | "transactions" | "investments" | "investmentsTransactions" | "identity";
const PRODUCTS: Product[] = ["accounts", "creditCards", "transactions", "investments", "investmentsTransactions", "identity"];

const json = (response: Response) => response.json().catch(() => null) as Promise<any>;
const iso = (value: unknown) => (typeof value === "string" ? value : null);

class SkipRead extends Error {}

/** Rows of one table to mirror: what Pluggy sent, plus the ids of what is stored in the period. */
interface Plan {
  lock: string;
  upserts: (() => Promise<unknown>)[];
  /** ids stored inside the period read that Pluggy no longer returns. */
  stale: string[];
  /** ids stored inside the period read. */
  inPeriod: number;
  remove: (ids: string[]) => Promise<unknown>;
}

export function createSync(deps: Deps): SyncApi {
  const { db, config } = deps;
  const inFlight = new Set<string>();
  let writes: Promise<unknown> = Promise.resolve();

  /** One request, retried `requestRetries` more times; a 429 waits for Retry-After. */
  async function call(path: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= config.requestRetries;
      let response: Response | null = null;
      try {
        response = await deps.request("GET", path);
      } catch (error) {
        if (last) throw error;
      }
      if (response) {
        if (response.status < 500 && response.status !== 429) return response;
        if (last) return response;
        if (response.status === 429) {
          const seconds = Number(response.headers.get("Retry-After"));
          const wait = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : config.retryDelayMs;
          await deps.sleep(Math.min(wait, config.maxRetryAfterMs));
          continue;
        }
      }
      await deps.sleep(config.retryDelayMs);
    }
  }

  /** Every page of a list endpoint, by `next` cursor (v2) or by page number. */
  async function fetchAll(base: string, query: string): Promise<any[]> {
    const all: any[] = [];
    let path = `${base}?${query}`;
    for (let pageNumber = 1; ; pageNumber++) {
      const response = await call(path);
      if (response.status !== 200) throw new Error(`${base} ${response.status}`);
      const body = await json(response);
      all.push(...((body?.results ?? []) as any[]));
      if (typeof body?.next === "string" && body.next) path = `${base}${body.next}`;
      else if (typeof body?.totalPages === "number" && pageNumber < body.totalPages) path = `${base}?${query}&page=${pageNumber + 1}`;
      else return all;
    }
  }

  async function setConnection(itemId: string, values: Partial<typeof connection.$inferInsert>) {
    await db.update(connection).set(values).where(eq(connection.itemId, itemId));
  }

  function minDate(rows: { date: string }[]) {
    return rows.reduce<string | null>((min, r) => (min === null || r.date < min ? r.date : min), null);
  }

  /** Splits stored rows into the ones the read covers (date >= period start) and the vanished ones. */
  function period<T extends { id: string }>(stored: T[], fetchedIds: Set<string>, inside: (row: T) => boolean) {
    const covered = stored.filter(inside);
    return { inPeriod: covered.length, stale: covered.filter((r) => !fetchedIds.has(r.id)).map((r) => r.id) };
  }

  async function mirrorRead(itemId: string, force: boolean): Promise<void> {
    const [conn] = await db.select().from(connection).where(eq(connection.itemId, itemId));
    if (!conn) return;

    const itemResponse = await call(`/items/${itemId}`);
    if (itemResponse.status === 404) {
      await setConnection(itemId, { reconnectReason: "not-found" }); // only a new login brings it back
      throw new SkipRead();
    }
    if (itemResponse.status !== 200) throw new Error(`item ${itemResponse.status}`);
    const pluggyItem = (await json(itemResponse)) as any;
    const lastUpdatedAt: string | null = iso(pluggyItem?.lastUpdatedAt);
    const execution: string = pluggyItem?.executionStatus ?? "SUCCESS";
    await setConnection(itemId, {
      pluggyStatus: iso(pluggyItem?.status),
      pluggyExecution: iso(pluggyItem?.executionStatus),
      pluggyUpdatedAt: lastUpdatedAt,
      ...(pluggyItem?.status === "LOGIN_ERROR" ? { reconnectReason: "login-error" } : {}),
    });
    if (pluggyItem?.status === "LOGIN_ERROR") throw new SkipRead();

    // Nothing new, and the last attempt completed: nothing to read.
    if (!force && conn.attemptComplete && conn.lastReadAt && lastUpdatedAt && lastUpdatedAt <= conn.lastReadAt) {
      throw new SkipRead();
    }
    if (pluggyItem?.status !== "UPDATED" || (execution !== "SUCCESS" && execution !== "PARTIAL_SUCCESS")) {
      throw new SkipRead(); // still updating, or a state other tickets handle
    }
    const full = execution === "SUCCESS";
    const detail = (product: Product) => pluggyItem?.statusDetail?.[product];
    const updated = (product: Product) => full || detail(product)?.isUpdated === true;
    const dateOf = (product: Product) => iso(detail(product)?.updatedAt) ?? lastUpdatedAt;

    // ---- 1. Read everything into memory. Any failure throws before the first write. ----
    const fetchedAccounts = await fetchAll("/accounts", `itemId=${itemId}`);
    const isCard = (a: any) => a.type === "CREDIT";
    const bankIds = fetchedAccounts.filter((a) => !isCard(a)).map((a) => a.id as string);
    const cardIds = fetchedAccounts.filter(isCard).map((a) => a.id as string);

    const txByAccount = new Map<string, any[]>();
    for (const [ids, product] of [[bankIds, "transactions"], [cardIds, "creditCards"]] as const) {
      if (!updated(product)) continue;
      for (const id of ids) txByAccount.set(id, await fetchAll("/v2/transactions", `accountId=${id}`));
    }
    const billsByAccount = new Map<string, any[]>();
    if (updated("creditCards")) {
      for (const id of cardIds) billsByAccount.set(id, await fetchAll("/bills", `accountId=${id}`));
    }
    let fetchedInvestments: any[] | null = null;
    const invTxById = new Map<string, any[]>();
    if (updated("investments")) {
      fetchedInvestments = await fetchAll("/investments", `itemId=${itemId}`);
      if (updated("investmentsTransactions")) {
        for (const inv of fetchedInvestments) {
          const response = await call(`/investments/${inv.id}/transactions`);
          if (response.status === 404 || response.status === 403) continue; // not reachable: keep what is stored
          if (response.status !== 200) throw new Error(`investment transactions ${response.status}`);
          invTxById.set(inv.id, ((await json(response))?.results ?? []) as any[]);
        }
      }
    }
    let fetchedIdentity: any | null = null;
    if (updated("identity")) {
      const response = await call(`/identity?itemId=${itemId}`);
      if (response.status === 200) {
        const body = await json(response);
        fetchedIdentity = Array.isArray(body?.results) ? (body.results[0] ?? null) : body;
      } else if (response.status !== 404) throw new Error(`identity ${response.status}`);
    }

    // Resources Pluggy marks UNAVAILABLE: the bank may be holding something back (best effort).
    let unavailable = false;
    try {
      const response = await call(`/items/${itemId}/resources`);
      if (response.status === 200) {
        const body = await json(response);
        const list: any[] = Array.isArray(body) ? body : Array.isArray(body?.results) ? body.results : [];
        unavailable = list.some((r) => r?.status === "UNAVAILABLE");
      }
    } catch {
      /* the flag is optional */
    }

    // ---- 2. Plan the mirror against what is stored. ----
    const plans: Plan[] = [];

    const txPlanFor = async (ids: string[]) => {
      const fetched = ids.flatMap((id) => txByAccount.get(id) ?? []);
      const stored = ids.length
        ? await db.select({ id: bankTransaction.id, date: bankTransaction.date, accountId: bankTransaction.accountId }).from(bankTransaction).where(inArray(bankTransaction.accountId, ids))
        : [];
      const start = new Map(ids.map((id) => [id, minDate((txByAccount.get(id) ?? []) as any)]));
      const { inPeriod, stale } = period(stored, new Set(fetched.map((t) => t.id as string)), (r) => {
        const from = start.get(r.accountId);
        return from != null && r.date >= from;
      });
      plans.push({
        lock: "transactions",
        upserts: ids.flatMap((id) => (txByAccount.get(id) ?? []).map((t) => () => upsertTransaction(t, id))),
        stale,
        inPeriod,
        remove: (gone) => db.delete(bankTransaction).where(inArray(bankTransaction.id, gone)),
      });
    };
    const bankScope = bankIds.filter((id) => txByAccount.has(id));
    const cardScope = cardIds.filter((id) => txByAccount.has(id));
    if (bankScope.length) await txPlanFor(bankScope);
    if (cardScope.length) await txPlanFor(cardScope);

    if (updated("creditCards") && cardIds.length) {
      const fetched = cardIds.flatMap((id) => billsByAccount.get(id) ?? []);
      const stored = await db.select({ id: bill.id, date: bill.dueDate }).from(bill).where(inArray(bill.accountId, cardIds));
      const from = minDate(fetched.map((b) => ({ date: b.dueDate as string })));
      const { inPeriod, stale } = period(stored, new Set(fetched.map((b) => b.id as string)), (r) => from != null && r.date >= from);
      plans.push({
        lock: "bills",
        upserts: cardIds.flatMap((id) => (billsByAccount.get(id) ?? []).map((b) => () => upsertBill(b, id))),
        stale,
        inPeriod,
        remove: (gone) => db.delete(bill).where(inArray(bill.id, gone)),
      });
    }

    if (fetchedInvestments) {
      const stored = await db.select({ id: investment.id }).from(investment).where(eq(investment.itemId, itemId));
      // Without a date, the whole set is the period; an empty answer is not trusted to delete.
      const { inPeriod, stale } = period(stored, new Set(fetchedInvestments.map((i) => i.id as string)), () => fetchedInvestments!.length > 0);
      plans.push({
        lock: "investments",
        upserts: fetchedInvestments.map((i) => () => upsertInvestment(i, itemId)),
        stale,
        inPeriod,
        remove: (gone) => db.delete(investment).where(inArray(investment.id, gone)),
      });
      const readIds = [...invTxById.keys()];
      if (readIds.length) {
        const fetched = readIds.flatMap((id) => invTxById.get(id)!.map((t) => ({ ...t, investmentId: id })));
        const storedTx = await db
          .select({ id: investmentTransaction.id, date: investmentTransaction.date, investmentId: investmentTransaction.investmentId })
          .from(investmentTransaction)
          .where(inArray(investmentTransaction.investmentId, readIds));
        const start = new Map(readIds.map((id) => [id, minDate(invTxById.get(id)!.map((t) => ({ date: invDate(t) })))]));
        const { inPeriod: n, stale: s } = period(storedTx, new Set(fetched.map((t) => t.id as string)), (r) => {
          const from = start.get(r.investmentId);
          return from != null && r.date >= from;
        });
        plans.push({
          lock: "investmentsTransactions",
          upserts: fetched.map((t) => () => upsertInvestmentTransaction(t)),
          stale: s,
          inPeriod: n,
          remove: (gone) => db.delete(investmentTransaction).where(inArray(investmentTransaction.id, gone)),
        });
      }
    }

    // ---- 3. The lock: a full SUCCESS read that would delete too much deletes nothing. ----
    const locked =
      full && plans.some((p) => p.inPeriod > 0 && p.stale.length / p.inPeriod > config.mirrorDeleteLimit);

    // ---- 4. Write it all in one database transaction. ----
    const previous: Record<string, string> = conn.productDates ? JSON.parse(conn.productDates) : {};
    const dates = { ...previous };
    for (const product of PRODUCTS) if (updated(product)) dates[product] = dateOf(product) ?? previous[product] ?? "";
    const known = Object.values(dates).filter(Boolean).sort();

    if (locked) {
      const worst = Math.max(...plans.filter((p) => p.inPeriod > 0).map((p) => p.stale.length / p.inPeriod));
      await deps.onLock?.(itemId, Math.round(worst * 100));
    }

    await inTransaction(async () => {
      const knownIds = new Set((await db.select({ id: bankTransaction.id }).from(bankTransaction)).map((t) => t.id));
      for (const a of fetchedAccounts) {
        if (updated(isCard(a) ? "creditCards" : "accounts")) await upsertAccount(a, itemId);
      }
      for (const plan of plans) {
        for (const upsert of plan.upserts) await upsert();
        if (!locked && plan.stale.length) await removeInChunks(plan);
      }
      if (!locked && deps.moveEdits) {
        const now = await db.select({ id: bankTransaction.id }).from(bankTransaction);
        await deps.moveEdits(now.map((t) => t.id).filter((id) => !knownIds.has(id)));
      }
      if (fetchedIdentity) await upsertIdentity(fetchedIdentity, itemId);
      if (!locked) await deps.takeSnapshot?.(itemId, unavailable);
      await setConnection(
        itemId,
        locked
          ? { attemptComplete: false, lockTriggered: true, readState: "done" }
          : {
              attemptComplete: true,
              lockTriggered: false,
              readState: "done",
              lastReadAt: lastUpdatedAt,
              productDates: JSON.stringify(dates),
              dataAt: known[0] ?? lastUpdatedAt,
            },
      );
    });
  }

  async function removeInChunks(plan: Plan) {
    for (let i = 0; i < plan.stale.length; i += 400) await plan.remove(plan.stale.slice(i, i + 400));
  }

  /** Serialised BEGIN/COMMIT: works for the sync and async drivers alike. */
  function inTransaction(work: () => Promise<void>): Promise<void> {
    const run = writes.then(async () => {
      await db.run(sql`BEGIN`);
      try {
        await work();
        await db.run(sql`COMMIT`);
      } catch (error) {
        await db.run(sql`ROLLBACK`);
        throw error;
      }
    });
    writes = run.catch(() => undefined);
    return run;
  }

  const invDate = (t: any) => (t.tradeDate ?? t.date) as string;

  async function upsertAccount(a: any, itemId: string) {
    const values = {
      id: a.id as string,
      itemId,
      type: a.type as string,
      subtype: a.subtype ?? null,
      name: a.name as string,
      number: a.number ?? null,
      balance: a.balance ?? null,
      currencyCode: a.currencyCode ?? null,
      extra: JSON.stringify({ bankData: a.bankData, creditData: a.creditData, reservedBalances: a.reservedBalances }),
    };
    await db.insert(account).values(values).onConflictDoUpdate({ target: account.id, set: values });
  }

  async function upsertTransaction(t: any, accountId: string) {
    const values = {
      id: t.id as string,
      accountId: (t.accountId ?? accountId) as string,
      date: t.date as string,
      description: t.description as string,
      descriptionRaw: t.descriptionRaw ?? null,
      amount: t.amount as number,
      amountInAccountCurrency: t.amountInAccountCurrency ?? null,
      currencyCode: t.currencyCode ?? null,
      balance: t.balance ?? null,
      category: t.category ?? null,
      categoryId: t.categoryId ?? null,
      status: t.status ?? null,
      type: t.type ?? null,
      operationType: t.operationType ?? null,
      extra: JSON.stringify({ creditCardMetadata: t.creditCardMetadata, paymentData: t.paymentData, merchant: t.merchant }),
    };
    await db.insert(bankTransaction).values(values).onConflictDoUpdate({ target: bankTransaction.id, set: values });
  }

  async function upsertBill(b: any, accountId: string) {
    const values = {
      id: b.id as string,
      accountId,
      dueDate: b.dueDate as string,
      totalAmount: b.totalAmount ?? null,
      currencyCode: b.totalAmountCurrencyCode ?? null,
      minimumPaymentAmount: b.minimumPaymentAmount ?? null,
      extra: JSON.stringify({ allowsInstallments: b.allowsInstallments, financeCharges: b.financeCharges, payments: b.payments }),
    };
    await db.insert(bill).values(values).onConflictDoUpdate({ target: bill.id, set: values });
  }

  async function upsertInvestment(i: any, itemId: string) {
    const values = {
      id: i.id as string,
      itemId,
      type: i.type ?? null,
      subtype: i.subtype ?? null,
      name: i.name as string,
      balance: i.balance ?? null,
      amount: i.amount ?? null,
      amountOriginal: i.amountOriginal ?? null,
      date: i.date ?? null,
      currencyCode: i.currencyCode ?? null,
      status: i.status ?? null,
      extra: JSON.stringify(i),
    };
    await db.insert(investment).values(values).onConflictDoUpdate({ target: investment.id, set: values });
  }

  async function upsertInvestmentTransaction(t: any) {
    const values = {
      id: t.id as string,
      investmentId: t.investmentId as string,
      type: t.type ?? null,
      date: invDate(t),
      description: t.description ?? null,
      quantity: t.quantity ?? null,
      value: t.value ?? null,
      amount: t.amount ?? null,
      extra: JSON.stringify(t),
    };
    await db.insert(investmentTransaction).values(values).onConflictDoUpdate({ target: investmentTransaction.id, set: values });
  }

  async function upsertIdentity(i: any, itemId: string) {
    const values = {
      itemId,
      fullName: i.fullName ?? null,
      document: i.document ?? null,
      documentType: i.documentType ?? null,
      extra: JSON.stringify(i),
    };
    await db.insert(identity).values(values).onConflictDoUpdate({ target: identity.itemId, set: values });
  }

  /** Runs one Connection's read. Resolves true when it failed. */
  async function read(itemId: string, force: boolean): Promise<boolean> {
    if (inFlight.has(itemId)) return false;
    const [due] = await db.select().from(connection).where(eq(connection.itemId, itemId));
    if (due && isExpired(due.consentExpiresAt, deps.clock())) return false; // expired: no sync, the data stays
    if (due?.reconnectReason) return false; // a reconectar: only a new login helps, the data stays
    if (await deps.credentialsRefused?.()) return false;
    inFlight.add(itemId);
    try {
      await mirrorRead(itemId, force);
      await deps.estimate?.(itemId);
      return false;
    } catch (error) {
      if (error instanceof SkipRead) {
        await deps.estimate?.(itemId); // a pending estimate is retried on every sync
        return false;
      }
      // Nothing was written. A first read that fails is "failed"; later ones just stay incomplete.
      const [conn] = await db.select().from(connection).where(eq(connection.itemId, itemId));
      await setConnection(itemId, conn?.lastReadAt ? { attemptComplete: false } : { readState: "failed", attemptComplete: false });
      return true;
    } finally {
      inFlight.delete(itemId);
    }
  }

  return {
    async readConnection(itemId) {
      await setConnection(itemId, { readState: "reading" });
      const failed = await read(itemId, true);
      if (!failed) {
        const [conn] = await db.select().from(connection).where(eq(connection.itemId, itemId));
        if (conn?.readState === "reading") await setConnection(itemId, { readState: conn.lastReadAt ? "done" : "failed" });
      }
    },

    async resumeReads() {
      const rows = await db.select().from(connection).where(eq(connection.readState, "reading"));
      await Promise.all(rows.map((r) => this.readConnection(r.itemId)));
    },

    async sync({ manual }) {
      if (await deps.credentialsRefused?.()) return { notices: [] };
      const rows = await db.select().from(connection);
      const results = await Promise.all(
        rows
          .filter((r) => r.readState !== "reading")
          .map(async (r) => ({ row: r, failed: await read(r.itemId, false) })),
      );
      const notices = results
        .filter((r) => r.failed)
        .map((r) => ({ itemId: r.row.itemId, message: `Não deu para atualizar o ${r.row.bankName} agora` }));
      return { notices: manual ? notices : [] };
    },

    async mirrorCounts() {
      const count = async (table: any) =>
        (await db.select().from(table)).length;
      return {
        transactions: await count(bankTransaction),
        bills: await count(bill),
        investments: await count(investment),
        investmentTransactions: await count(investmentTransaction),
        identities: await count(identity),
      };
    },
  };
}
