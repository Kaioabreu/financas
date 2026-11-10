import { describe, expect, it } from "vitest";
import { sourceLabel } from "./sourceLabel";

describe("sourceLabel", () => {
  it("usa o nome do banco quando a conta tem o nome da razão social", () => {
    expect(sourceLabel({ kind: "account", name: "Nu Pagamentos S.A. - Instituição de Pagamento", bankName: "Nubank" })).toBe("Nubank");
  });
  it("mantém o nome de uma conta com nome próprio", () => {
    expect(sourceLabel({ kind: "account", name: "BTG Banking", bankName: "BTG Pactual" })).toBe("BTG Banking");
  });
  it("cartão com nome genérico vira Cartão <banco>", () => {
    expect(sourceLabel({ kind: "card", name: "gold", bankName: "Nubank" })).toBe("Cartão Nubank");
    expect(sourceLabel({ kind: "card", name: "Mastercard", bankName: "Mercado Pago" })).toBe("Cartão Mercado Pago");
  });
  it("cartão que já se chama Cartão não repete", () => {
    expect(sourceLabel({ kind: "card", name: "Cartão BTG BLACK", bankName: "BTG Pactual" })).toBe("Cartão BTG BLACK");
  });
});
