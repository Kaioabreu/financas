import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import migrations from "../../drizzle/migrations";
import { openVault, type RawDatabase } from "../core/vault";
import * as schema from "../db/schema";

/** The open database, for the Backup export (ATTACH + sqlcipher_export). */
export let appSqlite: SQLiteDatabase | null = null;

export async function openAppVault() {
  const databaseName = (Constants.expoConfig?.extra?.databaseName as string) ?? "finance.db";
  const sqlite = await openDatabaseAsync(databaseName);
  appSqlite = sqlite;

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
