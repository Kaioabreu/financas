// Core: a version number for the stored data, so derived views are computed once per change.
// `trackWrites` wraps the database: every write (insert, update, delete, transaction, raw run)
// bumps the version once it has landed. `cached` keeps one result per key and version.
import type { CoreDatabase } from "./createCore";

/** Shared by every core over the same database, so a write through one is seen by all. */
interface Shared {
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setTimeout> | null;
}
/** Per core: its own cache (a core built with another config must not reuse these results). */
interface State {
  shared: Shared;
  entries: Map<string, { version: number; value: Promise<unknown> }>;
}
const states = new WeakMap<object, State>();
const sharedOf = new WeakMap<object, Shared>();

const WRITES = new Set(["insert", "update", "delete", "transaction", "run", "batch"]);
const TERMINAL = new Set(["run", "all", "get", "values", "execute", "returning"]);
/** Bursts of writes (a sync saves hundreds of rows) tell the screens once. */
const NOTIFY_DELAY_MS = 1000;

const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

export function trackWrites(db: CoreDatabase): CoreDatabase {
  let shared = sharedOf.get(db);
  if (!shared) sharedOf.set(db, (shared = { version: 0, listeners: new Set(), timer: null }));
  const sh = shared;
  const state: State = { shared: sh, entries: new Map() };
  const bump = () => {
    sh.version++;
    if (sh.timer) return;
    sh.timer = setTimeout(() => {
      sh.timer = null;
      for (const listener of [...sh.listeners]) listener();
    }, NOTIFY_DELAY_MS);
  };

  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop) {
        const value = Reflect.get(t, prop, t);
        if (prop === "then" && typeof value === "function") {
          return (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            (value as (a: unknown, b: unknown) => Promise<unknown>).call(
              t,
              (v: unknown) => {
                bump();
                return v;
              },
              (e: unknown) => {
                bump();
                throw e;
              },
            ).then(res, rej);
        }
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const result = (value as (...a: unknown[]) => unknown).apply(t, args);
          if (typeof prop === "string" && TERMINAL.has(prop)) {
            if (result instanceof Promise) return result.finally(bump);
            bump();
            return result;
          }
          return isObject(result) && !(result instanceof Promise) ? wrap(result) : result;
        };
      },
    });

  const tracked = new Proxy(db, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t);
      if (typeof value !== "function" || typeof prop !== "string" || !WRITES.has(prop)) return value;
      return (...args: unknown[]) => {
        const result = (value as (...a: unknown[]) => unknown).apply(t, args);
        if (result instanceof Promise) return result.finally(bump);
        if (prop === "transaction" || prop === "run" || prop === "batch") {
          bump();
          return result;
        }
        return isObject(result) ? wrap(result) : result;
      };
    },
  });
  states.set(tracked, state);
  return tracked;
}

/** How many writes the data has seen (0 for a database that is not tracked). */
export function dataVersion(db: object): number {
  return states.get(db)?.shared.version ?? 0;
}

/** Calls `listener` (debounced) after the stored data changes. Returns the unsubscribe. */
export function onDataChange(db: object, listener: () => void): () => void {
  const state = states.get(db);
  if (!state) return () => {};
  state.shared.listeners.add(listener);
  return () => state.shared.listeners.delete(listener);
}

/** Runs `compute` once per key and data version; a result that a write overtook is not kept. */
export function cached<T>(db: object, key: string, compute: () => Promise<T>): Promise<T> {
  const state = states.get(db);
  if (!state) return compute();
  const hit = state.entries.get(key);
  if (hit && hit.version === state.shared.version) return hit.value as Promise<T>;
  const version = state.shared.version;
  const value = compute();
  state.entries.set(key, { version, value });
  value.catch(() => {
    if (state.entries.get(key)?.value === value) state.entries.delete(key);
  });
  return value;
}
