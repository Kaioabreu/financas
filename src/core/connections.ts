// Core: connecting a bank through Meu Pluggy, and the first read of its data.
import { and, desc, eq, like } from "drizzle-orm";
import { account, bankTransaction, connection } from "../db/schema";
import type { EmbeddedConfig } from "./config";
import type { CoreDatabase } from "./createCore";

export type ConnectErrorKind = "limit" | "offline" | "unexpected";
export interface ConnectError {
  kind: ConnectErrorKind;
  message: string;
  helpUrl: string;
}
export type StartConnectResult =
  | { ok: true; itemId: string; authUrl: string }
  | { ok: false; error: ConnectError };
export type FinishConnectResult = { ok: true } | { ok: false; reason: "closed" | "expired" };

export type ReadState = "reading" | "done" | "failed";
export interface ConnectionSummary {
  itemId: string;
  bankName: string;
  readState: ReadState;
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
}

export interface ConnectionsApi {
  /** POST /items (connector 200) and wait for the OAuth URL the Custom Tab must open. */
  startConnect(): Promise<StartConnectResult>;
  /**
   * Polls the item until UPDATED and creates the Connection. Deletes the item when the tab
   * closed without authorizing, when Pluggy marks it OUTDATED, or after the timeout.
   */
  finishConnect(itemId: string, options: { tabClosed: Promise<void> }): Promise<FinishConnectResult>;
  listConnections(): Promise<ConnectionSummary[]>;
  /** First read: accounts, cards and every transaction page. Never throws; sets readState. */
  readConnection(itemId: string): Promise<void>;
  /** Restarts the read of Connections left in "reading" (app closed mid-read). */
  resumeReads(): Promise<void>;
  listAccounts(): Promise<AccountSummary[]>;
  /** `month` is YYYY-MM. */
  listTransactions(query: { accountId: string; month: string }): Promise<TransactionRow[]>;
}

interface Deps {
  db: CoreDatabase;
  config: EmbeddedConfig;
  clock: () => number;
  sleep: (ms: number) => Promise<void>;
  request: (method: string, path: string, body?: unknown) => Promise<Response>;
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
  const inFlight = new Set<string>();

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

  async function setReadState(itemId: string, readState: ReadState) {
    await db.update(connection).set({ readState }).where(eq(connection.itemId, itemId));
  }

  async function readAccounts(itemId: string) {
    const response = await deps.request("GET", `/accounts?itemId=${itemId}`);
    if (response.status !== 200) throw new Error(`accounts ${response.status}`);
    const results = ((await json(response))?.results ?? []) as any[];
    for (const a of results) {
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
    return results.map((a) => a.id as string);
  }

  async function readTransactions(accountId: string) {
    let path: string | null = `/v2/transactions?accountId=${accountId}`;
    while (path) {
      const response = await deps.request("GET", path);
      if (response.status !== 200) throw new Error(`transactions ${response.status}`);
      const body = await json(response);
      for (const t of (body?.results ?? []) as any[]) {
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
          extra: JSON.stringify({
            creditCardMetadata: t.creditCardMetadata,
            paymentData: t.paymentData,
            merchant: t.merchant,
          }),
        };
        await db.insert(bankTransaction).values(values).onConflictDoUpdate({ target: bankTransaction.id, set: values });
      }
      // `next` is a ready query string to paste after the path; null on the last page.
      path = body?.next ? `/v2/transactions${body.next}` : null;
    }
  }

  return {
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
      return rows.map((r) => ({ itemId: r.itemId, bankName: r.bankName, readState: r.readState as ReadState }));
    },

    async readConnection(itemId) {
      if (inFlight.has(itemId)) return;
      inFlight.add(itemId);
      try {
        await setReadState(itemId, "reading");
        const accountIds = await readAccounts(itemId);
        for (const id of accountIds) await readTransactions(id);
        await setReadState(itemId, "done");
      } catch {
        // Whatever was written stays: an incomplete read never deletes anything.
        await setReadState(itemId, "failed");
      } finally {
        inFlight.delete(itemId);
      }
    },

    async resumeReads() {
      const rows = await db.select().from(connection).where(eq(connection.readState, "reading"));
      await Promise.all(rows.map((r) => this.readConnection(r.itemId)));
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

    async listTransactions({ accountId, month }) {
      const rows = await db
        .select()
        .from(bankTransaction)
        .where(and(eq(bankTransaction.accountId, accountId), like(bankTransaction.date, `${month}-%`)))
        .orderBy(desc(bankTransaction.date));
      return rows.map((r) => ({
        id: r.id,
        description: r.description,
        date: r.date.slice(0, 10),
        amount: r.amountInAccountCurrency ?? r.amount,
      }));
    },
  };
}
