import { expect, it } from "vitest";
import { backupFileName } from "./backupName";

it("o nome do arquivo usa o dia local, não o UTC", () => {
  const lateEvening = new Date(2026, 10, 9, 23, 30).getTime(); // local 9 Nov, already the 10th in UTC for UTC-3
  expect(backupFileName(lateEvening)).toBe("financas-backup-2026-11-09.financas");
  const earlyMorning = new Date(2026, 10, 9, 0, 10).getTime();
  expect(backupFileName(earlyMorning)).toBe("financas-backup-2026-11-09.financas");
});
