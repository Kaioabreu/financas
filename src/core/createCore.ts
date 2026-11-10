// Core: pure TypeScript, no React Native / Expo imports.
// The shell hands it a database, fetch, clock, the secret store and the embedded config.
import { eq, like } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { EmbeddedConfig } from "./config";
import { account, appMeta, bankTransaction, bill, connection, identity, investment, investmentTransaction, snapshot } from "../db/schema";
import { onDataChange, trackWrites } from "./dataVersion";
import { createClassification, type ClassificationApi } from "./classification";
import { createConnections, type ConnectionsApi } from "./connections";
import { createSync, type SyncApi } from "./sync";
import { createEstimate } from "./estimate";
import { createNetWorth, type NetWorthApi } from "./networth";
import { createPerformance, type PerformanceApi } from "./performance";
import { createSummary, type SummaryApi } from "./summary";
import { createBills, type BillsApi } from "./bills";
import { createDiagnostics, type DiagnosticEnv } from "./diagnostic";
import { refuseInspection, type BackupFilePort, type RestoreInput, type RestoreResult } from "./restore";
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
  /** Reads and swaps in a Backup file (needs SQLCipher, so the shell supplies it). */
  restoreFile?: BackupFilePort;
  /** The kind of network now; the fund quotas (~135 MB) download freely only on Wi-Fi. Defaults to Wi-Fi. */
  network?: () => Promise<"wifi" | "cellular" | "offline">;
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

export interface Core extends ConnectionsApi, SyncApi, ClassificationApi, SummaryApi, NetWorthApi, BillsApi, PerformanceApi {
  /** Calls the listener (debounced) after the stored data changes; screens reload then instead of polling. */
  onDataChange(listener: () => void): () => void;
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
  /** True on the first opening (no credentials saved yet): the only time "Restaurar backup" exists. */
  canRestore(): Promise<boolean>;
  /**
   * Restores a Backup over the empty first-opening database: checks the password and the version,
   * checks the Client Secret against the Client ID that came in the backup, then replaces everything.
   */
  restoreBackup(input: RestoreInput): Promise<RestoreResult>;
  /**
   * "Apagar tudo", Pluggy half: tries DELETE /items/{id} on every Connection and carries on when one
   * fails. Returns how many failed (404, an item already gone, counts as erased). The shell then
   * erases the database, the SecureStore and the temporary backup file.
   */
  eraseAtPluggy(): Promise<{ failed: number }>;
  /** True while the fund quotas wait for the user to choose on mobile data ("Baixar agora" / "Esperar o Wi-Fi"). */
  fundQuotasPrompt(): Promise<boolean>;
  /** Saves the choice in the database; "download" retries the pending estimates right away. */
  answerFundQuotas(choice: "download" | "wait"): Promise<void>;
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
  const { config } = deps;
  // Every write goes through the tracked handle, so derived views are cached per change of data.
  const db = trackWrites(deps.db);
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

  function failure(kind: CredentialsErrorKind): { ok: false; error: CredentialsError } {
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

  const estimate = createEstimate({ db, fetch: deps.fetch, clock: deps.clock, network: deps.network });

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

  const performance = createPerformance({
    db,
    fetch: deps.fetch,
    clock: deps.clock,
    monthSummary: summary.monthSummary,
    portfolioNow: async () => (await networth.netWorth()).classes.filter((k) => k.class !== "cash").reduce((s, k) => s + k.value, 0),
  });

  const lock = createLock({
    clock: deps.clock,
    readEnabled: async () => (await readMeta(LOCK_KEY)) !== "0",
    writeEnabled: (enabled) => writeMeta(LOCK_KEY, enabled ? "1" : "0"),
    deviceHasLock: deps.deviceHasLock ?? (async () => true),
    credentialsSaved: async () => (await readMeta(CLIENT_ID_KEY)) !== null && (await deps.secret.get()) !== null,
  });

  return {
    onDataChange: (listener) => onDataChange(db, listener),
    lock,
    fundQuotasPrompt: estimate.fundQuotasPrompt,
    async answerFundQuotas(choice) {
      await estimate.answerFundQuotas(choice);
    },
    ...connections,
    ...summary,
    billGaps: bills.billGaps,
    netWorth: networth.netWorth,
    performance: performance.performance,
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

    async canRestore() {
      return !(await this.credentialsStatus()).saved;
    },

    async restoreBackup({ uri, password, clientSecret }) {
      const file = deps.restoreFile;
      if (!file) throw new Error("Restore is not available.");
      if (!(await this.canRestore())) {
        return { ok: false, kind: "not-first-open", message: "Só dá para restaurar na primeira abertura. Apague tudo antes." };
      }
      const inspection = await file.inspect(uri, password);
      const refusal = refuseInspection(inspection, file.appMigrations);
      if (refusal) return refusal;
      if (!inspection.ok) throw new Error("unreachable");
      const secret = clientSecret.trim();
      const auth = secret ? await authenticate({ clientId: inspection.clientId, clientSecret: secret }) : "missing";
      if (typeof auth === "string") return { ok: false, kind: "credentials", error: failure(auth).error };
      await file.replaceAll(uri, password);
      await deps.secret.set(secret);
      await db.delete(appMeta).where(eq(appMeta.key, REFUSED_KEY));
      apiKey = { value: auth.apiKey, expiresAt: deps.clock() + config.apiKeyTtlMs };
      return { ok: true };
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

    async eraseAtPluggy() {
      let failed = 0;
      for (const { itemId } of await connections.listConnections()) {
        try {
          const response = await request("DELETE", `/items/${itemId}`);
          if (!response.ok && response.status !== 404) failed++;
        } catch {
          failed++;
        }
      }
      return { failed };
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
