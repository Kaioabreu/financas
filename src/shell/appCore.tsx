import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext } from "react";
import { embeddedConfig } from "../core/config";
import { createCore, type Core } from "../core/createCore";

type Orm = Parameters<typeof createCore>[0]["db"];

export const SECRET_KEY = "pluggy-client-secret";

/** The running core, for the error screen (which renders outside the provider). */
export let currentCore: Core | null = null;

export function createAppCore(orm: unknown): Core {
  currentCore = createCore({
    db: orm as Orm,
    fetch: globalThis.fetch,
    clock: () => Date.now(),
    secret: {
      get: () => SecureStore.getItemAsync(SECRET_KEY),
      set: (value) => SecureStore.setItemAsync(SECRET_KEY, value),
      delete: () => SecureStore.deleteItemAsync(SECRET_KEY),
    },
    config: embeddedConfig,
    // Typo guard only (the file's own cipher is the real protection): iterated SHA-256 over salt and password.
    passwordHash: async (password, salt) => {
      let digest = `${salt}:${password}`;
      for (let i = 0; i < 1000; i++) digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${digest}`);
      return digest;
    },
    randomHex: (n) => Array.from(Crypto.getRandomBytes(n), (b) => b.toString(16).padStart(2, "0")).join(""),
    deviceHasLock: async () => (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE,
    env: { appVersion: Constants.expoConfig?.version ?? "?", otaId: Constants.manifest2?.id ?? null },
  });
  return currentCore;
}

const CoreContext = createContext<Core | null>(null);
export const CoreProvider = CoreContext.Provider;
export function useCore(): Core {
  const core = useContext(CoreContext);
  if (!core) throw new Error("CoreProvider is missing.");
  return core;
}
