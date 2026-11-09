// App lock policy: when the biometric prompt is due. The prompt itself (expo-local-authentication)
// lives in the shell; this decides only whether it must appear.
export const LOCK_GRACE_MS = 60_000;

export interface LockApi {
  /** True when the lock screen must cover the app: locked, enabled, device has a screen lock, credentials saved. */
  mustPrompt(): Promise<boolean>;
  /** Called after a successful biometric / device PIN check. */
  unlock(): void;
  appBackgrounded(): void;
  appForegrounded(): void;
  /** Wraps the Meu Pluggy Custom Tab: leaving the app for it never counts as being away. */
  duringExternalFlow<T>(flow: Promise<T>): Promise<T>;
  settings(): Promise<{ enabled: boolean; available: boolean }>;
  setEnabled(enabled: boolean): Promise<void>;
}

export interface LockDeps {
  clock: () => number;
  readEnabled: () => Promise<boolean>;
  writeEnabled: (enabled: boolean) => Promise<void>;
  deviceHasLock: () => Promise<boolean>;
  credentialsSaved: () => Promise<boolean>;
}

export function createLock(deps: LockDeps): LockApi {
  let locked = true; // cold start
  let backgroundedAt: number | null = null;
  let externalFlows = 0;

  return {
    async mustPrompt() {
      if (!locked) return false;
      if (!(await deps.credentialsSaved())) return false;
      if (!(await deps.deviceHasLock())) return false;
      return deps.readEnabled();
    },
    unlock() {
      locked = false;
      backgroundedAt = null;
    },
    appBackgrounded() {
      if (externalFlows === 0 && backgroundedAt === null) backgroundedAt = deps.clock();
    },
    appForegrounded() {
      if (externalFlows === 0 && backgroundedAt !== null && deps.clock() - backgroundedAt >= LOCK_GRACE_MS) locked = true;
      if (externalFlows === 0) backgroundedAt = null;
    },
    async duringExternalFlow(flow) {
      externalFlows++;
      try {
        return await flow;
      } finally {
        externalFlows--;
        backgroundedAt = null;
      }
    },
    async settings() {
      return { enabled: await deps.readEnabled(), available: await deps.deviceHasLock() };
    },
    setEnabled: (enabled) => deps.writeEnabled(enabled),
  };
}
