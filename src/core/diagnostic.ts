// Core: the diagnostic ("Copiar diagnóstico"). The text is built from an ALLOW-LIST:
// every line is written from named, typed fields below. Nothing is ever filtered out of
// raw data, so a new field from Pluggy cannot leak. Later tickets add a section to `SECTIONS`
// (state in the app: #34, estimate: #38, bill counts: #42).
import { eq } from "drizzle-orm";
import { appMeta, connection } from "../db/schema";
import type { CoreDatabase } from "./createCore";

export interface DiagnosticEnv {
  appVersion: string;
  /** The OTA update id, or null when the app runs the embedded bundle. */
  otaId: string | null;
}

/** What Pluggy's item says, reduced to the fields allowed in the text. */
interface ItemFacts {
  status: string | null;
  executionStatus: string | null;
  /** error.code only. error.message and providerMessage are never read. */
  errorCode: string | null;
  lastUpdatedAt: string | null;
  nextAutoSyncAt: string | null;
  /** product -> isUpdated */
  products: Record<string, boolean>;
}

interface Facts {
  authStatus: number | null;
  failure: { endpoint: string; status: number | null; streak: number } | null;
  /** Connection item id -> facts. Ids stay in storage; they never enter the text. */
  items: Record<string, ItemFacts>;
  /** Connection item id -> % the lock held back. */
  locks: Record<string, number>;
}

interface ConnectionRow {
  bankName: string;
  consentExpiresAt: string | null;
  productDates: Record<string, string>;
  facts: ItemFacts | null;
  lockPercent: number | null;
  /** State in the app ("em dia", "atrasada"...) and the cause code. */
  appState: string | null;
  appCause: string | null;
}

interface DiagnosticData {
  env: DiagnosticEnv;
  facts: Facts;
  connections: ConnectionRow[];
  credentialsRefused: boolean;
  /** Bill check counts of the cards of banks outside the validated list. Counts only. */
  billCounts: { verified: number; matching: number; mismatching: number }[];
}

/** A section turns the allowed data into lines. Add one here to grow the text. */
type Section = (data: DiagnosticData) => string[];

const orDash = (value: string | number | null | undefined) => (value === null || value === undefined || value === "" ? "-" : String(value));

const SECTIONS: Section[] = [
  ({ env }) => [`App ${env.appVersion} · atualização ${env.otaId ?? "embutida"}`],
  ({ facts, credentialsRefused }) => [`/auth: HTTP ${orDash(facts.authStatus)}${credentialsRefused ? " · credenciais recusadas" : ""}`],
  ({ connections }) =>
    connections.flatMap((c, i) => {
      const f = c.facts;
      const products = Object.entries(f?.products ?? {}).map(([name, ok]) => `${name}=${ok ? "sim" : "não"}`);
      const full = Object.entries(c.productDates).map(([name, date]) => `${name} ${date}`);
      return [
        `Conexão ${i + 1}: ${c.bankName}`,
        `  status ${orDash(f?.status)} · execução ${orDash(f?.executionStatus)} · erro ${orDash(f?.errorCode)}`,
        `  isUpdated: ${products.join(", ") || "-"}`,
        `  lastUpdatedAt ${orDash(f?.lastUpdatedAt)} · nextAutoSyncAt ${orDash(f?.nextAutoSyncAt)} · consentExpiresAt ${orDash(c.consentExpiresAt)}`,
        `  leitura completa: ${full.join(", ") || "-"}`,
        `  estado no app: ${c.appState ?? "-"} · causa ${c.appCause ?? "-"}`,
        ...(c.lockPercent !== null ? [`  trava ${c.lockPercent}%`] : []),
      ];
    }),
  ({ billCounts }) =>
    billCounts.map((c, i) => `Cartão ${i + 1}: faturas verificadas ${c.verified} · batem ${c.matching} · não batem ${c.mismatching}`),
  ({ facts }) => {
    const f = facts.failure;
    if (!f) return ["Última falha local: nenhuma"];
    return [`Última falha local: ${f.endpoint} (${f.status === null ? "sem resposta" : `HTTP ${f.status}`}), ${f.streak} seguidas`];
  },
];

const FACTS_KEY = "diagnostic.facts";
const EMPTY: Facts = { authStatus: null, failure: null, items: {}, locks: {} };
const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b\d{6,}\b/gi;

/** "/accounts/abc-123/x?itemId=..." -> "/accounts/{id}/x": ids and the query never leave. */
export function sanitizeEndpoint(path: string): string {
  return (path.split("?")[0] ?? "").replace(ID, "{id}");
}

const text = (value: unknown) => (typeof value === "string" ? value : null);

function itemFacts(raw: any): ItemFacts {
  const products: Record<string, boolean> = {};
  const detail = raw?.statusDetail;
  if (detail && typeof detail === "object") {
    for (const [name, value] of Object.entries(detail)) {
      if (typeof (value as any)?.isUpdated === "boolean") products[name] = (value as any).isUpdated;
    }
  }
  return {
    status: text(raw?.status),
    executionStatus: text(raw?.executionStatus),
    errorCode: text(raw?.error?.code),
    lastUpdatedAt: text(raw?.lastUpdatedAt),
    nextAutoSyncAt: text(raw?.nextAutoSyncAt),
    products,
  };
}

export interface Diagnostics {
  /** Called for every Pluggy request: records only the allowed facts. */
  observe(method: string, path: string, outcome: { status: number; body?: () => Promise<unknown> } | { error: true }): Promise<void>;
  observeAuth(status: number | null): Promise<void>;
  recordLock(itemId: string, percent: number): Promise<void>;
  build(): Promise<string>;
}

const STATE_NAME: Record<string, string> = {
  ok: "em dia",
  reading: "lendo",
  expiring: "vence em breve",
  late: "atrasada",
  reconnect: "a reconectar",
};

export function createDiagnostics(deps: {
  db: CoreDatabase;
  env: DiagnosticEnv;
  states: () => Promise<{ itemId: string; state: string; cause: string | null }[]>;
  credentialsRefused: () => Promise<boolean>;
  billCounts: () => Promise<{ verified: number; matching: number; mismatching: number }[]>;
}): Diagnostics {
  const { db } = deps;
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<Facts> {
    const rows = await db.select().from(appMeta).where(eq(appMeta.key, FACTS_KEY));
    return rows[0] ? { ...EMPTY, ...(JSON.parse(rows[0].value) as Partial<Facts>) } : { ...EMPTY, items: {}, locks: {} };
  }
  /** Read-modify-write, one at a time. Diagnostics must never break the app. */
  function update(change: (facts: Facts) => void): Promise<void> {
    queue = queue
      .then(async () => {
        const facts = await load();
        change(facts);
        const value = JSON.stringify(facts);
        await db.insert(appMeta).values({ key: FACTS_KEY, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
      })
      .catch(() => undefined);
    return queue as Promise<void>;
  }

  return {
    async observe(method, path, outcome) {
      const endpoint = `${method} ${sanitizeEndpoint(path)}`;
      const status = "error" in outcome ? null : outcome.status;
      const failed = status === null || status >= 400;
      const item = !failed && method === "GET" ? /^\/items\/([^/?]+)$/.exec(path.split("?")[0] ?? "") : null;
      const body = item && "body" in outcome ? await outcome.body?.().catch(() => null) : null;
      await update((facts) => {
        if (failed) facts.failure = { endpoint, status, streak: (facts.failure?.streak ?? 0) + 1 };
        else if (facts.failure) facts.failure = { ...facts.failure, streak: 0 };
        if (item && body) facts.items[item[1]!] = itemFacts(body);
      });
    },
    observeAuth: (status) => update((facts) => void (facts.authStatus = status)),
    recordLock: (itemId, percent) => update((facts) => void (facts.locks[itemId] = percent)),

    async build() {
      await queue;
      const facts = await load();
      const rows = await db.select().from(connection);
      const states = new Map((await deps.states()).map((s) => [s.itemId, s]));
      const connections: ConnectionRow[] = rows.map((r) => ({
        appState: STATE_NAME[states.get(r.itemId)?.state ?? ""] ?? null,
        appCause: states.get(r.itemId)?.cause ?? null,
        bankName: r.bankName,
        consentExpiresAt: r.consentExpiresAt,
        productDates: r.productDates ? JSON.parse(r.productDates) : {},
        facts: facts.items[r.itemId] ?? null,
        lockPercent: r.lockTriggered ? (facts.locks[r.itemId] ?? null) : null,
      }));
      const data: DiagnosticData = { env: deps.env, facts, connections, credentialsRefused: await deps.credentialsRefused(), billCounts: await deps.billCounts() };
      return ["Diagnóstico do Finanças", ...SECTIONS.flatMap((section) => section(data))].join("\n");
    },
  };
}
