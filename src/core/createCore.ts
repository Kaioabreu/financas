// Core: pure TypeScript, no React Native / Expo imports.
// The shell hands it a database, fetch, clock, the secret store and the embedded config.
import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { EmbeddedConfig } from "./config";
import { appMeta } from "../db/schema";
import { createConnections, type ConnectionsApi } from "./connections";
import { createSync, type SyncApi } from "./sync";

/** Works with both the sync (expo-sqlite) and async drivers: every query is awaited. */
export type CoreDatabase = BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, unknown>>;

export interface SecretStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  delete(): Promise<void>;
}

export interface CoreDeps {
  db: CoreDatabase;
  fetch: typeof fetch;
  clock: () => number;
  /** Holds the Client Secret (the shell backs it with SecureStore). */
  secret: SecretStore;
  config: EmbeddedConfig;
  /** Waits between polls; tests replace it to move the fake clock. */
  sleep?: (ms: number) => Promise<void>;
}

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

export type CredentialsErrorKind = "missing" | "refused" | "offline" | "unexpected";

export interface CredentialsError {
  kind: CredentialsErrorKind;
  message: string;
  /** Link to the matching "Problemas comuns" section of the guide. */
  helpUrl: string;
}

export type SaveCredentialsResult = { ok: true } | { ok: false; error: CredentialsError };
export type CredentialsStatus = { saved: false } | { saved: true; clientId: string };

export interface Core extends ConnectionsApi, SyncApi {
  credentialsStatus(): Promise<CredentialsStatus>;
  /** Checks the credentials with Pluggy (POST /auth) and saves them only on a 200. */
  saveCredentials(input: Credentials): Promise<SaveCredentialsResult>;
  /** An authenticated call to Pluggy; the apiKey is kept in memory and renewed after 2 h. */
  pluggyRequest(method: string, path: string, body?: unknown): Promise<Response>;
}

const CLIENT_ID_KEY = "pluggy.clientId";

export function createCore(deps: CoreDeps): Core {
  const { db, config } = deps;
  let apiKey: { value: string; expiresAt: number } | null = null;

  async function readMeta(key: string): Promise<string | null> {
    const rows = await db.select().from(appMeta).where(eq(appMeta.key, key));
    return rows[0]?.value ?? null;
  }
  async function writeMeta(key: string, value: string) {
    await db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
  }

  function failure(kind: CredentialsErrorKind): SaveCredentialsResult {
    const errors: Record<CredentialsErrorKind, { message: string; anchor: string }> = {
      missing: { message: "Preencha o Client ID e o Client Secret.", anchor: "problemas-comuns" },
      refused: {
        message: "Confira se copiou inteiro. Perdeu o secret? Gere outro no Dashboard.",
        anchor: "credenciais-recusadas",
      },
      offline: { message: "Sem internet. Conecte-se e tente de novo.", anchor: "sem-internet" },
      unexpected: {
        message: "Não deu para conferir as credenciais agora. Tente de novo.",
        anchor: "problemas-comuns",
      },
    };
    const { message, anchor } = errors[kind];
    return { ok: false, error: { kind, message, helpUrl: `${config.guideUrl}#${anchor}` } };
  }

  async function authenticate(credentials: Credentials): Promise<{ apiKey: string } | CredentialsErrorKind> {
    let response: Response;
    try {
      response = await deps.fetch(`${config.pluggyBaseUrl}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
    } catch {
      return "offline";
    }
    if (response.status === 401 || response.status === 403) return "refused";
    if (response.status !== 200) return "unexpected";
    const json = (await response.json().catch(() => null)) as { apiKey?: string } | null;
    return json?.apiKey ? { apiKey: json.apiKey } : "unexpected";
  }

  const request: Core["pluggyRequest"] = async (method, path, body) => {
    if (!apiKey || deps.clock() >= apiKey.expiresAt) {
      const clientId = await readMeta(CLIENT_ID_KEY);
      const clientSecret = await deps.secret.get();
      if (!clientId || !clientSecret) throw new Error("Credentials are not saved.");
      const result = await authenticate({ clientId, clientSecret });
      if (typeof result === "string") throw new Error(`Pluggy authentication failed (${result}).`);
      apiKey = { value: result.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
    }
    return deps.fetch(`${config.pluggyBaseUrl}${path}`, {
      method,
      headers: { "X-API-KEY": apiKey.value, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  const connections = createConnections({
    db,
    config,
    clock: deps.clock,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    request,
  });

  const sync = createSync({
    db,
    config,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    request,
  });

  return {
    ...connections,
    ...sync,
    async credentialsStatus() {
      const clientId = await readMeta(CLIENT_ID_KEY);
      const secret = await deps.secret.get();
      return clientId && secret ? { saved: true, clientId } : { saved: false };
    },

    async saveCredentials(input) {
      const clientId = input.clientId.trim();
      const clientSecret = input.clientSecret.trim();
      if (!clientId || !clientSecret) return failure("missing");

      const result = await authenticate({ clientId, clientSecret });
      if (typeof result === "string") return failure(result);

      await deps.secret.set(clientSecret);
      await writeMeta(CLIENT_ID_KEY, clientId);
      apiKey = { value: result.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
      return { ok: true };
    },

    pluggyRequest: request,
  };
}
