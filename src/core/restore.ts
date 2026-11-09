// Restoring a Backup. The file work (ATTACH, copy, migrate) needs SQLCipher, so the shell supplies it as a port.
import type { CredentialsError } from "./createCore";

export type BackupInspection =
  | { ok: true; clientId: string; /** `created_at` of every row of the backup's migrations table. */ migrations: number[] }
  | { ok: false; reason: "wrong-password" };

export interface BackupFilePort {
  /** `created_at` of every migration this app knows. */
  appMigrations: number[];
  /** Opens the file with the password and reads the Client ID and the migrations table, touching nothing. */
  inspect(uri: string, password: string): Promise<BackupInspection>;
  /** Replaces all the data with the file's, then runs the app's migrations over it. */
  replaceAll(uri: string, password: string): Promise<void>;
}

export interface RestoreInput {
  uri: string;
  password: string;
  clientSecret: string;
}

export type RestoreResult =
  | { ok: true }
  | { ok: false; kind: "wrong-password" | "newer" | "not-first-open"; message: string }
  | { ok: false; kind: "credentials"; error: CredentialsError };

/**
 * The migrations table decides: a backup with a migration this app lacks is newer and is refused;
 * anything else is the same or older, and the app's own migrations complete it.
 */
export function checkBackupVersion(backup: number[], app: number[]): "same" | "older" | "newer" {
  const known = new Set(app);
  if (backup.some((m) => !known.has(m))) return "newer";
  return backup.length < app.length ? "older" : "same";
}

export const WRONG_PASSWORD_MESSAGE = "Senha incorreta. Confira também se o arquivo é um backup do Finanças.";
export const NEWER_BACKUP_MESSAGE = "Atualize o app para restaurar este backup";

/** The refusal for a file that cannot be restored by this app, or null when it can. */
export function refuseInspection(inspection: BackupInspection, appMigrations: number[]): { ok: false; kind: "wrong-password" | "newer"; message: string } | null {
  if (!inspection.ok) return { ok: false, kind: "wrong-password", message: WRONG_PASSWORD_MESSAGE };
  if (checkBackupVersion(inspection.migrations, appMigrations) === "newer") return { ok: false, kind: "newer", message: NEWER_BACKUP_MESSAGE };
  return null;
}
