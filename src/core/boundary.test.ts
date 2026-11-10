import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("núcleo", () => {
  it("não importa nada de React Native nem do Expo", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const offenders = files.filter((f) =>
      /from\s+["'](react|react-native|expo)(["'/-])/.test(readFileSync(dir + f, "utf8")),
    );
    expect(files.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
