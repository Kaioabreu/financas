// Core: connecting a bank through Meu Pluggy, and the first read of its data.
import { and, desc, eq, inArray, like, ne } from "drizzle-orm";
import { account, bankTransaction, bill, connection, identity, investment, investmentTransaction, snapshot } from "../db/schema";
import type { Classification, ClassificationSource, ClassifiedAs } from "./classification";
import type { EmbeddedConfig } from "./config";
import type { CoreDatabase } from "./createCore";
import { buildInstallmentPlan } from "./installments";

export type ConnectErrorKind = "limit" | "offline" | "unexpected";
export interface ConnectError {
  kind: ConnectErrorKind;
  message: string;
  helpUrl: string;
}
export type StartConnectResult =
  | { ok: true; itemId: string; authUrl: string }
  | { ok: false; error: ConnectError };
/** `renewed` is true when the item was a known bank's new authorization, not a new Connection. */
export type FinishConnectResult = { ok: true; renewed?: true } | { ok: false; reason: "closed" | "expired" };

export type ReadState = "reading" | "done" | "failed";
/** Days before the expiry from which the Connection asks to be renewed. */
export const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 86_400_000;
export type ConnectionState = "reading" | "ok" | "expiring" | "expired";
/** Days left of the authorization (rounded up), or null when Pluggy sent no expiry. */
export function daysUntil(expiresAt: string | null, now: number): number | null {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isNaN(at) ? null : Math.ceil((at - now) / DAY_MS);
}
/** An expired Connection stops syncing and keeps its data. */
export function isExpired(expiresAt: string | null, now: number): boolean {
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  return !Number.isNaN(at) && now >= at;
}

export interface ConnectionSummary {
  itemId: string;
  bankName: string;
  readState: ReadState;
  /** ISO date of the oldest product data held: "Dados de <data>". Null before the first read. */
  dataAt: string | null;
  /** True when the last full read was held back by the 20% lock. */
  lockTriggered: boolean;
  /** The last finished read, as Pluggy dated it (lastUpdatedAt). */
  lastReadAt: string | null;
  consentExpiresAt: string | null;
  /** Days left of the authorization; null when unknown. */
  daysLeft: number | null;
  state: ConnectionState;
}
export interface AccountSummary {
  id: string;
  itemId: string;
  name: string;
  kind: "account" | "card";
}
export interface TransactionRow {
  id: string;
  description: string;
  /** YYYY-MM-DD. */
  date: string;
  /** amountInAccountCurrency when Pluggy filled it, otherwise amount. */
  amount: number;
  /** The classification, computed from the raw fields and the embedded configuration. */
  nature: Classification["nature"];
  category?: Classification["category"];
  origin?: Classification["origin"];
  /** Where the classification came from. */
  source: ClassificationSource;
  accountId: string;
  /** The account's name, as Pluggy sent it. */
  accountName: string;
  /** "k de N", for a parcela of a compra parcelada. */
  installment?: { number: number; total: number };
  /** YYYY-MM-DD: the day of the purchase, for a parcela. */
  purchaseDate?: string;
}

export interface ConnectionsApi {
  /** POST /items (connector 200) and wait for the OAuth URL the Custom Tab must open. */
  startConnect(): Promise<StartConnectResult>;
  /**
   * Polls the item until UPDATED and creates the Connection. Deletes the item when the tab
   * closed without authorizing, when Pluggy marks it OUTDATED, or after the timeout.
   */
  finishConnect(itemId: string, options: { tabClosed: Promise<void> }): Promise<FinishConnectResult>;
  /**
   * Deletes the item at Pluggy and this bank's local data (accounts, transactions, bills,
   * investments, operations, identity). Rules and hand edits stay.
   */
  removeConnection(itemId: string): Promise<void>;
  listConnections(): Promise<ConnectionSummary[]>;
  listAccounts(): Promise<AccountSummary[]>;
  /**
   * `month` is YYYY-MM. Without `accountId`, every account. With `category` or `days` (days of
   * the month), only the gastos and reembolsos that the Gastos tab summed for that slice.
   */
  listTransactions(query: {
    accountId?: string;
    month: string;
    category?: Classification["category"];
    days?: { from: number; to: number };
  }): Promise<TransactionRow[]>;
}

interface Deps {
  db: CoreDatabase;
  config: EmbeddedConfig;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  request: (method: string, path: string, body?: unknown) => Promise<Response>;
  classify: (ids: string[]) => Promise<Map<string, ClassifiedAs>>;
}

interface PluggyItem {
  id: string;
  status?: string;
  connector?: { id?: number; name?: string };
  createdAt?: string;
  consentExpiresAt?: string;
  parameter?: { data?: string } | null;
}

const WAITING_FOR_USER = ["WAITING_USER_ACTION", "WAITING_USER_INPUT"];
const json = (response: Response) => response.json().catch(() => null) as Promise<any>;

export function createConnections(deps: Deps): ConnectionsApi {
  const { db, config } = deps;

  function connectError(kind: ConnectErrorKind): StartConnectResult {
    const errors: Record<ConnectErrorKind, { message: string; anchor: string }> = {
      limit: {
        message: "O Meu Pluggy recusou este banco. Você pode ter até 5 bancos, todos no seu nome.",
        anchor: "limite-de-5-bancos",
      },
      offline: { message: "Sem internet. Conecte-se e tente de novo.", anchor: "sem-internet" },
      unexpected: { message: "Não deu para abrir o Meu Pluggy agora. Tente de novo.", anchor: "problemas-comuns" },
    };
    const { message, anchor } = errors[kind];
    return { ok: false, error: { kind, message, helpUrl: `${config.guideUrl}#${anchor}` } };
  }

  async function getItem(itemId: string): Promise<PluggyItem | null> {
    try {
      const response = await deps.request("GET", `/items/${itemId}`);
      return response.status === 200 ? ((await json(response)) as PluggyItem) : null;
    } catch {
      return null; // transient: the caller keeps polling until the timeout
    }
  }

  async function deleteItem(itemId: string) {
    try {
      await deps.request("DELETE", `/items/${itemId}`);
    } catch {
      // Best effort: the item can still be removed in the Dashboard.
    }
  }

  /** The Connection that already holds one of the new item's account, card or investment ids. */
  async function knownOwner(newItemId: string): Promise<string | null> {
    const ids: string[] = [];
    for (const path of ["/accounts", "/investments"]) {
      try {
        const response = await deps.request("GET", `${path}?itemId=${newItemId}`);
        if (response.status !== 200) continue;
        const results = ((await json(response))?.results ?? []) as { id?: string }[];
        ids.push(...results.map((r) => r.id).filter((id): id is string => Boolean(id)));
      } catch {
        // Unreadable: treated as a new Connection.
      }
    }
    if (!ids.length) return null;
    const hit =
      (await db.select({ itemId: account.itemId }).from(account).where(and(inArray(account.id, ids), ne(account.itemId, newItemId))))[0] ??
      (await db.select({ itemId: investment.itemId }).from(investment).where(and(inArray(investment.id, ids), ne(investment.itemId, newItemId))))[0];
    if (!hit) return null;
    const [conn] = await db.select().from(connection).where(eq(connection.itemId, hit.itemId));
    return conn ? conn.itemId : null;
  }

  /** The Connection moves to the new item; data and hand edits stay untouched. */
  async function renew(oldItemId: string, newItemId: string, current: PluggyItem) {
    const [old] = await db.select().from(connection).where(eq(connection.itemId, oldItemId));
    await db.insert(connection).values({ ...old!, itemId: newItemId, readState: "reading", consentExpiresAt: current.consentExpiresAt ?? null });
    await db.update(account).set({ itemId: newItemId }).where(eq(account.itemId, oldItemId));
    await db.update(investment).set({ itemId: newItemId }).where(eq(investment.itemId, oldItemId));
    await db.update(identity).set({ itemId: newItemId }).where(eq(identity.itemId, oldItemId));
    await db.update(snapshot).set({ itemId: newItemId }).where(eq(snapshot.itemId, oldItemId));
    await db.delete(connection).where(eq(connection.itemId, oldItemId));
    await deleteItem(oldItemId);
  }

  return {
    async removeConnection(itemId) {
      await deleteItem(itemId);
      const accountIds = (await db.select({ id: account.id }).from(account).where(eq(account.itemId, itemId))).map((a) => a.id);
      const investmentIds = (await db.select({ id: investment.id }).from(investment).where(eq(investment.itemId, itemId))).map((i) => i.id);
      for (let i = 0; i < accountIds.length; i += 400) {
        const chunk = accountIds.slice(i, i + 400);
        await db.delete(bankTransaction).where(inArray(bankTransaction.accountId, chunk));
        await db.delete(bill).where(inArray(bill.accountId, chunk));
      }
      for (let i = 0; i < investmentIds.length; i += 400) {
        await db.delete(investmentTransaction).where(inArray(investmentTransaction.investmentId, investmentIds.slice(i, i + 400)));
      }
      await db.delete(investment).where(eq(investment.itemId, itemId));
      await db.delete(account).where(eq(account.itemId, itemId));
      await db.delete(identity).where(eq(identity.itemId, itemId));
      await db.delete(snapshot).where(eq(snapshot.itemId, itemId));
      await db.delete(connection).where(eq(connection.itemId, itemId));
    },

    async startConnect() {
      let created: Response;
      try {
        created = await deps.request("POST", "/items", { connectorId: config.meuPluggyConnectorId, parameters: {} });
      } catch {
        return connectError("offline");
      }
      if (created.status === 401 || created.status >= 500) return connectError("unexpected");
      if (created.status >= 400) return connectError("limit");
      const itemId = ((await json(created)) as PluggyItem | null)?.id;
      if (!itemId) return connectError("unexpected");

      const deadline = deps.clock() + config.authorizationTimeoutMs;
      while (deps.clock() < deadline) {
        const current = await getItem(itemId);
        const authUrl = current?.parameter?.data;
        if (authUrl) return { ok: true, itemId, authUrl };
        if (current?.status === "OUTDATED" || current?.status === "LOGIN_ERROR") break;
        await deps.sleep(config.pollIntervalMs);
      }
      await deleteItem(itemId);
      return connectError("unexpected");
    },

    async finishConnect(itemId, { tabClosed }) {
      let closed = false;
      void tabClosed.then(() => {
        closed = true;
      });
      const deadline = deps.clock() + config.authorizationTimeoutMs;
      let graceUsed = false;

      while (true) {
        const current = await getItem(itemId);
        if (current?.status === "UPDATED") {
          const owner = await knownOwner(itemId);
          if (owner) {
            await renew(owner, itemId, current);
            return { ok: true, renewed: true };
          }
          await db
            .insert(connection)
            .values({
              itemId,
              bankName: current.connector?.name ?? "Banco",
              connectorId: current.connector?.id ?? null,
              createdAt: current.createdAt ?? null,
              consentExpiresAt: current.consentExpiresAt ?? null,
              readState: "reading",
            })
            .onConflictDoNothing();
          return { ok: true };
        }
        if (current?.status === "OUTDATED" || current?.status === "LOGIN_ERROR" || deps.clock() >= deadline) {
          await deleteItem(itemId);
          return { ok: false, reason: "expired" };
        }
        if (closed && current && WAITING_FOR_USER.includes(current.status ?? "")) {
          if (graceUsed) {
            await deleteItem(itemId);
            return { ok: false, reason: "closed" };
          }
          // Pluggy may take a moment to move the item after the authorization: look once more.
          graceUsed = true;
          await deps.sleep(config.tabClosedGraceMs);
          continue;
        }
        await deps.sleep(config.pollIntervalMs);
      }
    },

    async listConnections() {
      const rows = await db.select().from(connection);
      const now = deps.clock();
      return rows.map((r) => {
        const daysLeft = daysUntil(r.consentExpiresAt, now);
        const state: ConnectionState = isExpired(r.consentExpiresAt, now)
          ? "expired"
          : r.readState === "reading"
            ? "reading"
            : daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS
              ? "expiring"
              : "ok";
        return {
          itemId: r.itemId,
          bankName: r.bankName,
          readState: r.readState as ReadState,
          dataAt: r.dataAt,
          lockTriggered: r.lockTriggered,
          lastReadAt: r.lastReadAt,
          consentExpiresAt: r.consentExpiresAt,
          daysLeft,
          state,
        };
      });
    },

    async listAccounts() {
      const rows = await db.select().from(account);
      return rows.map((r) => ({
        id: r.id,
        itemId: r.itemId,
        name: r.name,
        kind: r.type === "CREDIT" ? ("card" as const) : ("account" as const),
      }));
    },

    async listTransactions({ accountId, month, category, days }) {
      // The month is the one the transaction counts in, not the one Pluggy dated it.
      const plan = await buildInstallmentPlan(db);
      const rows = (await (accountId ? db.select().from(bankTransaction).where(eq(bankTransaction.accountId, accountId)) : db.select().from(bankTransaction)))
        .filter((r) => plan.dateOf(r.id, r.date).startsWith(`${month}-`))
        .sort((a, b) => plan.dateOf(b.id, b.date).localeCompare(plan.dateOf(a.id, a.date)));
      const classes = await deps.classify(rows.map((r) => r.id));
      const owners = new Map((await db.select().from(account)).map((a) => [a.id, a.name]));
      const filtered = Boolean(category || days);
      return rows
        .map((r) => ({
          id: r.id,
          description: r.description,
          date: plan.dateOf(r.id, r.date),
          ...(plan.byId.get(r.id)?.installment
            ? { installment: { number: plan.byId.get(r.id)!.installment!.number, total: plan.byId.get(r.id)!.installment!.total }, purchaseDate: plan.byId.get(r.id)!.installment!.purchaseDate }
            : {}),
          amount: r.amountInAccountCurrency ?? r.amount,
          accountId: r.accountId,
          accountName: owners.get(r.accountId) ?? "",
          ...classes.get(r.id)!,
        }))
        .filter((r) => {
          if (!filtered) return true;
          if (r.nature !== "expense" && r.nature !== "refund") return false;
          if (category && r.category !== category) return false;
          const d = Number(r.date.slice(8, 10));
          return !days || (d >= days.from && d <= days.to);
        });
    },
  };
}
