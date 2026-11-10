import { describe, expect, it } from "vitest";
import { deriveBankName } from "./bankName";

const bank = (code: string, name = "Conta Sintética") => ({ type: "BANK", name, transferNumber: `${code}/0001/00000-0` });
const card = (name = "Cartão Sintético") => ({ type: "CREDIT", name, transferNumber: null });

describe("Nome do banco da Conexão", () => {
  it("vem do código do banco no número de transferência da conta", () => {
    expect(deriveBankName([bank("208")], 1)).toBe("BTG Pactual");
    expect(deriveBankName([bank("260")], 1)).toBe("Nubank");
    expect(deriveBankName([bank("323")], 1)).toBe("Mercado Pago");
  });

  it("duas contas do mesmo banco dão um nome só", () => {
    expect(deriveBankName([bank("208"), bank("208"), card()], 1)).toBe("BTG Pactual");
  });

  it("vários bancos: nomes distintos na ordem em que aparecem, ligados por 'e'", () => {
    expect(deriveBankName([bank("208"), bank("260")], 1)).toBe("BTG Pactual e Nubank");
    expect(deriveBankName([bank("208"), bank("260"), bank("323")], 1)).toBe("BTG Pactual, Nubank e Mercado Pago");
  });

  it("código desconhecido usa o nome da conta como o Pluggy mandou", () => {
    expect(deriveBankName([bank("999", "Banco Fictício S.A.")], 1)).toBe("Banco Fictício S.A.");
  });

  it("sem conta corrente (só cartão) ou sem nome legível, 'Conta N'", () => {
    expect(deriveBankName([card("Cartão Fictício")], 1)).toBe("Conta 1");
    expect(deriveBankName([], 2)).toBe("Conta 2");
    expect(deriveBankName([{ type: "BANK", name: "", transferNumber: null }], 3)).toBe("Conta 3");
  });
});
