import { describe, expect, it } from "vitest";
import { copyableDiagnostic } from "./errorDiagnostic";

describe("diagnóstico da tela de erro", () => {
  const error = Object.assign(new Error('Failed query: insert into "bank_transaction" params: PADARIA DO ZE,-42.5,52998224725,client-id-123'), {
    name: "DrizzleQueryError",
    stack:
      'DrizzleQueryError: Failed query: ... PADARIA DO ZE,52998224725\n    at run (node_modules/drizzle-orm/sqlite-core/session.js:10:5)\n    at upsert (src/core/sync.ts:120:14)',
  });

  it("não leva mensagem, parâmetros nem pilha, só o nome do erro e o ponto no código do app", () => {
    const text = copyableDiagnostic("Versão 1.0", error);

    expect(text).toContain("Versão 1.0");
    expect(text).toContain("DrizzleQueryError em src/core/sync.ts:120");
    for (const secret of ["PADARIA", "52998224725", "client-id-123", "insert into", "-42.5", "node_modules"]) expect(text).not.toContain(secret);
  });

  it("sem pilha do app, leva só o nome", () => {
    expect(copyableDiagnostic("d", { name: "TypeError", stack: "boom with 52998224725" })).toBe("d\n\nErro: TypeError");
  });
});
