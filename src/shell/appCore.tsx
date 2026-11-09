import * as SecureStore from "expo-secure-store";
import { createContext, useContext } from "react";
import { embeddedConfig } from "../core/config";
import { createCore, type Core } from "../core/createCore";

type Orm = Parameters<typeof createCore>[0]["db"];

const SECRET_KEY = "pluggy-client-secret";

export function createAppCore(orm: unknown): Core {
  return createCore({
    db: orm as Orm,
    fetch: globalThis.fetch,
    clock: () => Date.now(),
    secret: {
      get: () => SecureStore.getItemAsync(SECRET_KEY),
      set: (value) => SecureStore.setItemAsync(SECRET_KEY, value),
      delete: () => SecureStore.deleteItemAsync(SECRET_KEY),
    },
    config: embeddedConfig,
  });
}

const CoreContext = createContext<Core | null>(null);
export const CoreProvider = CoreContext.Provider;
export function useCore(): Core {
  const core = useContext(CoreContext);
  if (!core) throw new Error("CoreProvider is missing.");
  return core;
}
