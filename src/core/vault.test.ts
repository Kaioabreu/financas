import { describe, expect, it } from "vitest";
import { CipherUnavailableError, openVault, type VaultPorts } from "./vault";

function fakePorts(overrides: Partial<VaultPorts<string>> = {}) {
  const log: string[] = [];
  const store = new Map<string, string>();
  const ports: VaultPorts<string> = {
    secureStore: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
    },
    randomBytes: (n) => Uint8Array.from({ length: n }, (_, i) => i + 1),
    database: {
      execute: async (sql) => void log.push(`exec:${sql}`),
      queryCipherVersion: async () => "4.5.7 community",
      close: async () => void log.push("close"),
    },
    createOrm: () => {
      log.push("createOrm");
      return "orm";
    },
    migrate: async () => void log.push("migrate"),
    ...overrides,
  };
  return { ports, log, store };
}

const KEY_HEX = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

describe("openVault", () => {
  it("on first open generates a 32-byte key, stores it, and applies it before creating the ORM", async () => {
    const { ports, log, store } = fakePorts();

    const vault = await openVault(ports);

    expect(store.get("db-key")).toBe(KEY_HEX);
    expect(log).toEqual([`exec:PRAGMA key = "x'${KEY_HEX}'"`, "createOrm", "migrate"]);
    expect(vault.orm).toBe("orm");
    expect(vault.cipherVersion).toBe("4.5.7 community");
  });

  it("reuses the stored key on later opens instead of generating a new one", async () => {
    const { ports, log, store } = fakePorts({
      randomBytes: () => {
        throw new Error("must not generate");
      },
    });
    store.set("db-key", "ab".repeat(32));

    await openVault(ports);

    expect(log[0]).toBe(`exec:PRAGMA key = "x'${"ab".repeat(32)}'"`);
  });

  it("fails closed when SQLCipher is missing: closes the db, never creates the ORM or migrates", async () => {
    const { ports, log } = fakePorts();
    ports.database.queryCipherVersion = async () => null;

    await expect(openVault(ports)).rejects.toBeInstanceOf(CipherUnavailableError);
    expect(log).not.toContain("createOrm");
    expect(log).not.toContain("migrate");
    expect(log).toContain("close");
  });

  it("treats an empty cipher_version as missing", async () => {
    const { ports } = fakePorts();
    ports.database.queryCipherVersion = async () => "";

    await expect(openVault(ports)).rejects.toBeInstanceOf(CipherUnavailableError);
  });
});
