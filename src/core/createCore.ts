// Core: pure TypeScript, no React Native / Expo imports.
// The shell hands it a database, fetch, clock, the secret store and the embedded config.
import { eq, like } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { EmbeddedConfig } from "./config";
import { account, appMeta, bankTransaction, bill, connection, identity, investment, investmentTransaction, snapshot } from "../db/schema";
import { createClassification, type ClassificationApi } from "./classification";
import { createConnections, type ConnectionsApi } from "./connections";
import { createSync, type SyncApi } from "./sync";
import { createEstimate } from "./estimate";
import { createNetWorth, type NetWorthApi } from "./networth";
import { createSummary, type SummaryApi } from "./summary";
import { createBills, type BillsApi } from "./bills";
import { createDiagnostics, type DiagnosticEnv } from "./diagnostic";
import { createLock, type LockApi } from "./lock";
import { backupNotice, buildNotices, readSnoozes, REFUSED_KEY, snoozeKey, SNOOZE_MS, type NoticeQueue } from "./status";

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
  /** App and OTA update versions, for the diagnostic. */
  env?: DiagnosticEnv;
  /** Whether the phone has a screen lock (biometric or PIN) to unlock the app with. */
  deviceHasLock?: () => Promise<boolean>;
  /** Salted one-way hash of the Backup password, for the verifier (the shell uses expo-crypto). */
  passwordHash: (password: string, salt: string) => Promise<string>;
  /** `n` random bytes as hex, for the verifier's salt. */
  randomHex: (n: number) => string;
}

export type BackupPasswordResult = { ok: true } | { ok: false; reason: "too-short" | "mismatch" };
export interface BackupStatus {
  passwordSet: boolean;
  lastBackupAt: string | null;
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

export type Appearance = "system" | "light" | "dark";

export interface Core extends ConnectionsApi, SyncApi, ClassificationApi, SummaryApi, NetWorthApi, BillsApi {
  /** The "Copiar diagnóstico" text: only allow-listed facts, never amounts, names or ids. */
  diagnostic(): Promise<string>;
  credentialsStatus(): Promise<CredentialsStatus>;
  /** True after Pluggy refused (401/403) the saved credentials, until the Client Secret is updated. */
  credentialsRefused(): Promise<boolean>;
  /** Keeps the Client ID and checks the new Client Secret with Pluggy before saving it. */
  updateClientSecret(clientSecret: string): Promise<SaveCredentialsResult>;
  /** The Resumo's one notice (highest priority) and how many more wait ("e mais N"). */
  notices(): Promise<NoticeQueue>;
  /** "Agora não": hides a notice for 30 days. Rejected credentials cannot be snoozed. */
  snoozeNotice(key: string): Promise<void>;
  /**
   * "Trocar de aplicação": erases the Connections and the downloaded data and forgets the credentials.
   * The rules and the hand edits stay.
   */
  switchApplication(): Promise<void>;
  backupStatus(): Promise<BackupStatus>;
  /** Sets (or replaces, "Criar nova senha") the Backup password verifier: 8+ characters, typed twice. */
  createBackupPassword(password: string, confirmation: string): Promise<BackupPasswordResult>;
  /** Checks a typed password against the stored verifier. The password itself is never stored. */
  verifyBackupPassword(password: string): Promise<boolean>;
  /** Marks a Backup as just made ("Último backup"). */
  recordBackup(): Promise<void>;
  /** Bloqueio por biometria: when to prompt, and the Segurança switch. */
  lock: LockApi;
  /** Do sistema (the default), Claro or Escuro. */
  appearance(): Promise<Appearance>;
  setAppearance(value: Appearance): Promise<void>;
  /** Checks the credentials with Pluggy (POST /auth) and saves them only on a 200. */
  saveCredentials(input: Credentials): Promise<SaveCredentialsResult>;
  /** An authenticated call to Pluggy; the apiKey is kept in memory and renewed after 2 h. */
  pluggyRequest(method: string, path: string, body?: unknown): Promise<Response>;
}

const CLIENT_ID_KEY = "pluggy.clientId";
const APPEARANCE_KEY = "appearance";
const BACKUP_VERIFIER_KEY = "backup.verifier";
const LAST_BACKUP_KEY = "backup.lastAt";
export const BACKUP_MIN_PASSWORD = 8;
const LOCK_KEY = "lock.enabled";

export function createCore(deps: CoreDeps): Core {
  const { db, config } = deps;
  let apiKey: { value: string; expiresAt: number } | null = null;
  const diagnostics = createDiagnostics({
    db,
    env: deps.env ?? { appVersion: "?", otaId: null },
    states: async () => (await connections.listConnections()).map((c) => ({ itemId: c.itemId, state: c.state, cause: c.status?.causeCode ?? null })),
    credentialsRefused: () => credentialsRefused(),
    billCounts: () => bills.otherBankCounts(),
  });

  async function readMeta(key: string): Promise<string | null> {
    const rows = await db.select().from(appMeta).where(eq(appMeta.key, key));
    return rows[0]?.value ?? null;
  }
  async function writeMeta(key: string, value: string) {
    await db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
  }

  async function credentialsRefused() {
    return (await readMeta(REFUSED_KEY)) === "1";
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
      await diagnostics.observeAuth(null);
      return "offline";
    }
    await diagnostics.observeAuth(response.status);
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
      if (result === "refused") await writeMeta(REFUSED_KEY, "1");
      if (typeof result === "string") throw new Error(`Pluggy authentication failed (${result}).`);
      apiKey = { value: result.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
    }
    let response: Response;
    try {
      response = await deps.fetch(`${config.pluggyBaseUrl}${path}`, {
        method,
        headers: { "X-API-KEY": apiKey.value, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      await diagnostics.observe(method, path, { error: true });
      throw error;
    }
    await diagnostics.observe(method, path, { status: response.status, body: () => response.clone().json() });
    return response;
  };

  const bills = createBills({ db, config, clock: deps.clock });

  const classification = createClassification({ db, config });

  const connections = createConnections({
    classify: classification.classify,
    db,
    config,
    clock: deps.clock,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    request,
    credentialsRefused,
  });

  const networth = createNetWorth({ db, clock: deps.clock });

  const estimate = createEstimate({ db, fetch: deps.fetch, clock: deps.clock });

  const sync = createSync({
    estimate: estimate.run,
    takeSnapshot: networth.takeSnapshot,
    db,
    config,
    clock: deps.clock,
    sleep: deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    request,
    onLock: diagnostics.recordLock,
    moveEdits: classification.moveEdits,
    credentialsRefused,
  });

  const summary = createSummary({ db, clock: deps.clock, classify: classification.classify });

  const lock = createLock({
    clock: deps.clock,
    readEnabled: async () => (await readMeta(LOCK_KEY)) !== "0",
    writeEnabled: (enabled) => writeMeta(LOCK_KEY, enabled ? "1" : "0"),
    deviceHasLock: deps.deviceHasLock ?? (async () => true),
    credentialsSaved: async () => (await readMeta(CLIENT_ID_KEY)) !== null && (await deps.secret.get()) !== null,
  });

  return {
    lock,
    ...connections,
    ...summary,
    billGaps: bills.billGaps,
    netWorth: networth.netWorth,
    ...sync,
    cpfStatus: classification.cpfStatus,
    setCpf: classification.setCpf,
    editTransaction: classification.editTransaction,
    previewRule: classification.previewRule,
    addRule: classification.addRule,
    deleteRule: classification.deleteRule,
    listRules: classification.listRules,
    moveEdits: classification.moveEdits,
    diagnostic: () => diagnostics.build(),
    async credentialsStatus() {
      const clientId = await readMeta(CLIENT_ID_KEY);
      const secret = await deps.secret.get();
      return clientId && secret ? { saved: true, clientId } : { saved: false };
    },

    credentialsRefused,

    async updateClientSecret(secret) {
      const clientId = await readMeta(CLIENT_ID_KEY);
      const clientSecret = secret.trim();
      if (!clientId || !clientSecret) return failure("missing");
      const result = await authenticate({ clientId, clientSecret });
      if (typeof result === "string") return failure(result);
      await deps.secret.set(clientSecret);
      await db.delete(appMeta).where(eq(appMeta.key, REFUSED_KEY));
      apiKey = { value: result.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
      return { ok: true };
    },

    async notices() {
      const sources = await connections.listConnections();
      const snoozes = await readSnoozes(db);
      const synced = sources.some((s) => s.lastReadAt !== null);
      const backup = backupNotice(await readMeta(LAST_BACKUP_KEY), synced, deps.clock());
      return buildNotices(await credentialsRefused(), sources, (key) => snoozes.get(key) ?? 0, deps.clock(), backup);
    },

    async backupStatus() {
      return { passwordSet: (await readMeta(BACKUP_VERIFIER_KEY)) !== null, lastBackupAt: await readMeta(LAST_BACKUP_KEY) };
    },

    async createBackupPassword(password, confirmation) {
      if (password.length < BACKUP_MIN_PASSWORD) return { ok: false, reason: "too-short" };
      if (password !== confirmation) return { ok: false, reason: "mismatch" };
      const salt = deps.randomHex(16);
      await writeMeta(BACKUP_VERIFIER_KEY, `${salt}:${await deps.passwordHash(password, salt)}`);
      return { ok: true };
    },

    async verifyBackupPassword(password) {
      const stored = await readMeta(BACKUP_VERIFIER_KEY);
      if (!stored) return false;
      const [salt, hash] = stored.split(":");
      return (await deps.passwordHash(password, salt!)) === hash;
    },

    async recordBackup() {
      await writeMeta(LAST_BACKUP_KEY, new Date(deps.clock()).toISOString());
    },

    async snoozeNotice(key) {
      if (key === "credentials") return;
      await writeMeta(snoozeKey(key), String(deps.clock() + SNOOZE_MS));
    },

    async switchApplication() {
      for (const table of [bankTransaction, bill, investmentTransaction, investment, account, identity, snapshot, connection]) {
        await db.delete(table);
      }
      await db.delete(appMeta).where(eq(appMeta.key, CLIENT_ID_KEY));
      await db.delete(appMeta).where(eq(appMeta.key, REFUSED_KEY));
      await db.delete(appMeta).where(like(appMeta.key, `${snoozeKey("")}%`));
      await deps.secret.delete();
      apiKey = null;
    },

    async appearance() {
      const value = await readMeta(APPEARANCE_KEY);
      return value === "light" || value === "dark" ? value : "system";
    },

    async setAppearance(value) {
      await writeMeta(APPEARANCE_KEY, value);
    },

    async saveCredentials(input) {
      const clientId = input.clientId.trim();
      const clientSecret = input.clientSecret.trim();
      if (!clientId || !clientSecret) return failure("missing");

      const result = await authenticate({ clientId, clientSecret });
      if (typeof result === "string") return failure(result);

      await deps.secret.set(clientSecret);
      await writeMeta(CLIENT_ID_KEY, clientId);
      await db.delete(appMeta).where(eq(appMeta.key, REFUSED_KEY));
      apiKey = { value: result.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
      return { ok: true };
    },

    pluggyRequest: request,
  };
}
