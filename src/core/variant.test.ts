import { describe, expect, it } from "vitest";
import { resolveVariant } from "./variant";

describe("resolveVariant", () => {
  it("defaults to the production app", () => {
    expect(resolveVariant(undefined)).toEqual({
      name: "Finanças",
      slug: "financas",
      androidPackage: "com.kabreu.finance",
      databaseName: "finance.db",
    });
  });

  it("dev is a different app with its own package and database", () => {
    expect(resolveVariant("dev")).toEqual({
      name: "Finanças Dev",
      slug: "financas",
      androidPackage: "com.kabreu.finance.dev",
      databaseName: "finance-dev.db",
    });
  });

  it("rejects an unknown variant instead of silently shipping production", () => {
    expect(() => resolveVariant("stagin")).toThrow(/APP_VARIANT/);
  });
});
