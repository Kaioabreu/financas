import { describe, expect, it } from "vitest";
import type { TransactionRow } from "../core/connections";
import { dayHeading, withDayHeadings } from "./dayGroups";

const row = (id: string, date: string) => ({ id, date }) as TransactionRow;

describe("dayGroups", () => {
  it("heading with day, month and weekday", () => {
    expect(dayHeading("2026-10-31")).toBe("31 out · sábado");
    expect(dayHeading("2026-11-02")).toBe("2 nov · segunda");
  });
  it("one heading per day, newest first", () => {
    const items = withDayHeadings([row("a", "2026-10-30"), row("b", "2026-10-31"), row("c", "2026-10-30")]);
    expect(items.map((i) => i.key)).toEqual(["d2026-10-31", "b", "d2026-10-30", "a", "c"]);
  });
});
