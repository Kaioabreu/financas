import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import { KEY_NAME, openVault, type RawDatabase } from "../core/vault";
import * as schema from "../db/schema";
import { SECRET_KEY } from "./appCore";

let open: { sqlite: SQLiteDatabase; name: string } | null = null;

/**
 * "Apagar tudo", local half: closes and deletes the database, and clears the SecureStore (database
 * key and Client Secret). The temporary backup file needs no cleanup here: shareBackup deletes it as soon as the share sheet closes.
 */
export async function eraseLocalData() {
  if (open) {
    await open.sqlite.closeAsync().catch(() => {});
    await deleteDatabaseAsync(open.name).catch(() => {});
    open = null;
  }
  await SecureStore.deleteItemAsync(KEY_NAME).catch(() => {});
  await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => {});
}

/** The open database, for the Backup export (ATTACH + sqlcipher_export). */
export let appSqlite: SQLiteDatabase | null = null;

export async function openAppVault() {
  const databaseName = (Constants.expoConfig?.extra?.databaseName as string) ?? "finance.db";
  const sqlite = await openDatabaseAsync(databaseName);
  appSqlite = sqlite;
  open = { sqlite, name: databaseName };

  const database: RawDatabase = {
    execute: (sql) => sqlite.execAsync(sql),
    queryCipherVersion: async () => {
      const row = await sqlite.getFirstAsync<{ cipher_version?: string }>("PRAGMA cipher_version");
      return row?.cipher_version ?? null;
    },
    close: () => sqlite.closeAsync(),
  };

  return openVault({
    // No requireAuthentication: keeps the key readable for a future background sync.
    secureStore: {
      get: (key) => SecureStore.getItemAsync(key),
      set: (key, value) => SecureStore.setItemAsync(key, value),
    },
    randomBytes: (n) => Crypto.getRandomBytes(n),
    database,
    createOrm: () => drizzle(sqlite, { schema }),
    migrate: (orm) => migrate(orm, migrations),
  });
}
