import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useCore } from "./appCore";

/**
 * Runs `load` when the screen gains focus (or `deps` change) and again whenever the stored data
 * changes, but only while the screen is in front. Replaces the old every-3-seconds polling: a hidden
 * tab does no work, and a quiet database does none either.
 * `load` receives `alive()`; check it before setting state.
 */
export function useLiveData(load: (alive: () => boolean) => Promise<void> | void, deps: unknown[]) {
  const core = useCore();
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const run = () => void load(() => alive);
      run();
      const off = core.onDataChange(run);
      return () => {
        alive = false;
        off();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [core, ...deps]),
  );
}
