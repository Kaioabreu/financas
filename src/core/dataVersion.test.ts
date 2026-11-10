import { describe, expect, it, vi } from "vitest";
import { appMeta } from "../db/schema";
import { createTestWorld } from "../testing/world";
import { cached, dataVersion, onDataChange, trackWrites } from "./dataVersion";

async function tracked() {
  const w = await createTestWorld();
  return trackWrites(w.db as never);
}

describe("Versão dos dados: cache por mudança", () => {
  it("calcula uma vez enquanto nada é gravado, e de novo depois de uma gravação", async () => {
    const db = await tracked();
    const compute = vi.fn(async () => dataVersion(db));
    expect(await cached(db, "k", compute)).toBe(0);
    expect(await cached(db, "k", compute)).toBe(0);
    expect(compute).toHaveBeenCalledTimes(1);

    await db.insert(appMeta).values({ key: "x", value: "1" });
    expect(await cached(db, "k", compute)).toBe(1);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("chamadas simultâneas dividem o mesmo cálculo", async () => {
    const db = await tracked();
    const compute = vi.fn(async () => 7);
    await Promise.all([cached(db, "k", compute), cached(db, "k", compute)]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("um cálculo que uma gravação alcançou no meio não fica guardado", async () => {
    const db = await tracked();
    let release!: () => void;
    const slow = cached(db, "k", () => new Promise<number>((r) => (release = () => r(1))));
    await db.insert(appMeta).values({ key: "x", value: "1" });
    release();
    await slow;
    const compute = vi.fn(async () => 2);
    expect(await cached(db, "k", compute)).toBe(2);
  });

  it("avisa os ouvintes uma vez depois de uma rajada de gravações", async () => {
    vi.useFakeTimers();
    try {
      const db = await tracked();
      const listener = vi.fn();
      const off = onDataChange(db, listener);
      for (let i = 0; i < 5; i++) await db.insert(appMeta).values({ key: `k${i}`, value: "1" });
      expect(listener).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1100);
      expect(listener).toHaveBeenCalledTimes(1);
      off();
    } finally {
      vi.useRealTimers();
    }
  });
});
