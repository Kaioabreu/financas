import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { openDatabaseAsync } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import { backupFileName } from "../core/backupName";
import type { BackupFilePort } from "../core/restore";
import { appSqlite } from "./openDatabase";

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * Writes the whole database (migrations table included, but not the Client Secret or the database key,
 * which live in SecureStore) to a copy encrypted with the user's password, hands it to the share sheet
 * and deletes it from the cache.
 */
export async function shareBackup(password: string, now: number): Promise<void> {
  if (!appSqlite) throw new Error("O banco não está aberto.");
  const file = new File(Paths.cache, backupFileName(now));
  if (file.exists) file.delete();
  // Absolute path, without file://.
  const path = decodeURIComponent(file.uri.replace(/^file:\/\//, ""));
  try {
    await appSqlite.execAsync(`ATTACH DATABASE ${quote(path)} AS backup KEY ${quote(password)};`);
    try {
      await appSqlite.execAsync("SELECT sqlcipher_export('backup');");
    } finally {
      await appSqlite.execAsync("DETACH DATABASE backup;");
    }
    await Sharing.shareAsync(file.uri, { dialogTitle: "Salvar backup", mimeType: "application/octet-stream" });
  } finally {
    if (file.exists) file.delete();
  }
}

const pathOf = (file: { uri: string }) => decodeURIComponent(file.uri.replace(/^file:\/\//, ""));
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** `created_at` of every migration this app knows (Drizzle stores the journal's `when`). */
const appMigrations = (migrations.journal.entries as { when: number }[]).map((e) => e.when);

/**
 * The Backup file as a restorable source. `inspect` opens it on a connection of its own, so it works
 * even when the app's database is the unreadable one; `replaceAll` copies every table into the app's
 * database (which keeps its own key) and runs the app's migrations over the copy.
 */
export const restoreFilePort: BackupFilePort = {
  appMigrations,

  async inspect(uri, password) {
    const file = new File(uri);
    const db = await openDatabaseAsync(file.name, undefined, pathOf(file.parentDirectory));
    try {
      await db.execAsync(`PRAGMA key = ${quote(password)};`);
      try {
        await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
        const clientId = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = 'pluggy.clientId'");
        const rows = await db.getAllAsync<{ created_at: number }>("SELECT created_at FROM __drizzle_migrations");
        if (!clientId) return { ok: false, reason: "wrong-password" };
        return { ok: true, clientId: clientId.value, migrations: rows.map((r) => Number(r.created_at)) };
      } catch {
        // SQLCipher cannot tell a wrong password from a file that is not a Backup.
        return { ok: false, reason: "wrong-password" };
      }
    } finally {
      await db.closeAsync();
    }
  },

  async replaceAll(uri, password) {
    if (!appSqlite) throw new Error("O banco não está aberto.");
    const db = appSqlite;
    const path = pathOf(new File(uri));
    const tables = (schema: string) =>
      db.getAllAsync<{ name: string; sql: string }>(`SELECT name, sql FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
    await db.execAsync("PRAGMA foreign_keys = OFF;");
    await db.execAsync(`ATTACH DATABASE ${quote(path)} AS backup KEY ${quote(password)};`);
    try {
      const incoming = await tables("backup");
      const indexes = await db.getAllAsync<{ sql: string }>("SELECT sql FROM backup.sqlite_master WHERE type = 'index' AND sql IS NOT NULL");
      const existing = await tables("main");
      await db.execAsync("BEGIN;");
      try {
        // Replace, never merge: the empty first-opening tables go, the backup's come in with their rows.
        for (const t of existing) await db.execAsync(`DROP TABLE ${ident(t.name)};`);
        for (const t of incoming) {
          await db.execAsync(t.sql);
          await db.execAsync(`INSERT INTO main.${ident(t.name)} SELECT * FROM backup.${ident(t.name)};`);
        }
        for (const i of indexes) await db.execAsync(i.sql);
        await db.execAsync("COMMIT;");
      } catch (error) {
        await db.execAsync("ROLLBACK;");
        throw error;
      }
    } finally {
      await db.execAsync("DETACH DATABASE backup;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
    }
    // An older Backup is brought up to date with the app's migrations (forward only).
    await migrate(drizzle(db), migrations);
  },
};
