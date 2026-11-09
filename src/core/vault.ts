// Core: pure TypeScript, no React Native / Expo imports. The shell supplies the ports.

export class CipherUnavailableError extends Error {
  constructor() {
    super("SQLCipher is not available in this binary; refusing to open the database.");
    this.name = "CipherUnavailableError";
  }
}

/** The database file exists but the key does not open it. Nothing was changed. */
export class UnreadableDatabaseError extends Error {
  constructor() {
    super("The database exists but the key does not open it.");
    this.name = "UnreadableDatabaseError";
  }
}

export interface RawDatabase {
  execute(sql: string): Promise<void>;
  /** Result of `PRAGMA cipher_version`; null or empty when SQLCipher is absent. */
  queryCipherVersion(): Promise<string | null>;
  /** Whether the keyed database can be read (`SELECT count(*) FROM sqlite_master`). */
  canRead(): Promise<boolean>;
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
  const storedKey = await ports.secureStore.get(KEY_NAME);
  const keyHex = storedKey ?? toHex(ports.randomBytes(KEY_BYTES));

  await ports.database.execute(`PRAGMA key = "x'${keyHex}'"`);

  const cipherVersion = await ports.database.queryCipherVersion();
  if (!cipherVersion) {
    await ports.database.close();
    throw new CipherUnavailableError();
  }

  if (!(await ports.database.canRead())) {
    // A new key is not saved: the old one may still turn up, and the user decides what happens to the file.
    await ports.database.close();
    throw new UnreadableDatabaseError();
  }
  if (!storedKey) await ports.secureStore.set(KEY_NAME, keyHex);

  const orm = ports.createOrm(ports.database);
  await ports.migrate(orm);
  return { orm, cipherVersion };
}
