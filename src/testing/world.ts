// The single test seam: the core, created over in-memory SQLite (same schema and
// migrations as the app), a fake fetch routed by URL + method, and a controlled clock.
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { migrate } from "drizzle-orm/sqlite-proxy/migrator";
import { embeddedConfig, type EmbeddedConfig } from "../core/config";
import { createCore, type Core } from "../core/createCore";
import * as schema from "../db/schema";

export interface FakeResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}
export interface RecordedCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}
export type Responder = FakeResponse | ((call: RecordedCall) => FakeResponse | Promise<FakeResponse>);

export class FakeFetch {
  readonly calls: RecordedCall[] = [];
  private routes = new Map<string, Responder>();
  private offline = false;

  /** Respond to `METHOD url` (query string ignored when matching). */
  on(method: string, url: string, responder: Responder) {
    this.routes.set(`${method.toUpperCase()} ${url}`, responder);
  }
  goOffline() {
    this.offline = true;
  }
  goOnline() {
    this.offline = false;
  }
  callsTo(method: string, url: string) {
    return this.calls.filter((c) => c.method === method.toUpperCase() && c.url === url);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    this.calls.push({
      method,
      url,
      headers: { ...((init?.headers ?? {}) as Record<string, string>) },
      body: rawBody ? JSON.parse(rawBody) : undefined,
    });
    const call = this.calls[this.calls.length - 1]!;
    if (this.offline) throw new TypeError("Network request failed");
    const responder = this.routes.get(`${method} ${url.split("?")[0]}`);
    if (!responder) return jsonResponse({ status: 404, body: { message: `no fake route for ${method} ${url}` } });
    return jsonResponse(typeof responder === "function" ? await responder(call) : responder);
  };
}

function jsonResponse({ status = 200, body = {}, headers = {} }: FakeResponse): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export class FakeClock {
  constructor(private ms: number) {}
  now = () => this.ms;
  advance(ms: number) {
    this.ms += ms;
  }
}

export const HOUR = 3_600_000;

export class FakeSecretStore {
  value: string | null = null;
  get = async () => this.value;
  set = async (v: string) => {
    this.value = v;
  };
  delete = async () => {
    this.value = null;
  };
}

export async function createTestWorld(options: { config?: Partial<EmbeddedConfig>; startAt?: string; env?: { appVersion: string; otaId: string | null } } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === "run") {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      const rows = stmt.all(...(params as never[])) as unknown as unknown[][];
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    },
    { schema },
  );
  await migrate(
    db,
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        for (const q of queries) sqlite.exec(q);
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
    { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) },
  );

  const fake = new FakeFetch();
  const clock = new FakeClock(Date.parse(options.startAt ?? "2026-11-09T12:00:00.000Z"));
  const secret = new FakeSecretStore();
  const build = (override: Partial<EmbeddedConfig> = {}): Core =>
    createCore({
      db: db as never,
      fetch: fake.fetch,
      clock: clock.now,
      secret,
      sleep: async (ms) => clock.advance(ms),
      config: { ...embeddedConfig, ...options.config, ...override },
      env: options.env,
      passwordHash: async (password, salt) => createHash("sha256").update(`${salt}:${password}`).digest("hex"),
      randomHex: (n) => randomBytes(n).toString("hex"),
    });
  return { core: build(), dumpMeta: async () => sqlite.prepare("select * from app_meta").all(), /** A fresh core over the same database, as after an app restart. */ restart: (config?: Partial<EmbeddedConfig>) => build(config), fetch: fake, clock, secret };
}
