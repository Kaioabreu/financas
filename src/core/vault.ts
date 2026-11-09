// Core: pure TypeScript, no React Native / Expo imports. The shell supplies the ports.

export class CipherUnavailableError extends Error {
  constructor() {
    super("SQLCipher is not available in this binary; refusing to open the database.");
    this.name = "CipherUnavailableError";
  }
}

export interface RawDatabase {
  execute(sql: string): Promise<void>;
  /** Result of `PRAGMA cipher_version`; null or empty when SQLCipher is absent. */
  queryCipherVersion(): Promise<string | null>;
  close(): Promise<void>;
}

export interface VaultPorts<Orm> {
  secureStore: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
  };
  randomBytes(length: number): Uint8Array;
  database: RawDatabase;
  createOrm(database: RawDatabase): Orm;
  /** Forward-only migrations (Drizzle). */
  migrate(orm: Orm): Promise<void>;
}

export interface Vault<Orm> {
  orm: Orm;
  cipherVersion: string;
}

export const KEY_NAME = "db-key";
const KEY_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function openVault<Orm>(ports: VaultPorts<Orm>): Promise<Vault<Orm>> {
  let keyHex = await ports.secureStore.get(KEY_NAME);
  if (!keyHex) {
    keyHex = toHex(ports.randomBytes(KEY_BYTES));
    await ports.secureStore.set(KEY_NAME, keyHex);
  }

  await ports.database.execute(`PRAGMA key = "x'${keyHex}'"`);

  const cipherVersion = await ports.database.queryCipherVersion();
  if (!cipherVersion) {
    await ports.database.close();
    throw new CipherUnavailableError();
  }

  const orm = ports.createOrm(ports.database);
  await ports.migrate(orm);
  return { orm, cipherVersion };
}
