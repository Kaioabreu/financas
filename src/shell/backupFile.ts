import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { appSqlite } from "./openDatabase";

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** financas-backup-AAAA-MM-DD.financas */
export const backupFileName = (now: number) => `financas-backup-${new Date(now).toISOString().slice(0, 10)}.financas`;

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
