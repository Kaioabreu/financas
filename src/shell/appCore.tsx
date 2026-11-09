import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext } from "react";
import { embeddedConfig } from "../core/config";
import { createCore, type Core } from "../core/createCore";

type Orm = Parameters<typeof createCore>[0]["db"];

const SECRET_KEY = "pluggy-client-secret";

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
    deviceHasLock: async () => (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE,
    network: async () => {
      const state = await Network.getNetworkStateAsync().catch(() => null);
      if (!state || state.isConnected === false) return "offline";
      return state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET ? "wifi" : "cellular";
    },
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
