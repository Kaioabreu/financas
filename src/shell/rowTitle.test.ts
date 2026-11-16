import { describe, expect, it } from "vitest";
import { rowTitle } from "./rowTitle";

describe("rowTitle", () => {
  it("Pix keeps the standard format", () => {
    expect(rowTitle("Pix recebido ANA SOUZA", 5)).toMatchObject({ title: "Pix de Ana Souza", kind: "pix-received" });
  });
  it("a merchant is cleaned and the original is kept", () => {
    expect(rowTitle("EC *SAMSUNGSAO PAULOBRA", -5)).toMatchObject({ title: "Samsung", original: "EC *SAMSUNGSAO PAULOBRA" });
  });
  it("custom aliases", () => {
    expect(rowTitle("LOJA XYZ 1", -5, [{ contains: "loja xyz", name: "Loja X" }]).title).toBe("Loja X");
  });
  it("CardBankslip é o pagamento da fatura do cartão", () => {
    expect(rowTitle("CardBankslip", -5000, undefined, { nature: "bill-payment" })).toMatchObject({ title: "Pagamento de fatura", kind: "other", original: "CardBankslip" });
    expect(rowTitle("CardBankslip", -5000).title).toBe("Pagamento de fatura");
  });
  it("InternalTransfer ganha o nome pelo que o app entendeu dela", () => {
    expect(rowTitle("InternalTransfer", 9000, undefined, { nature: "income", origin: "salary" }).title).toBe("Salário");
    expect(rowTitle("InternalTransfer", 300, undefined, { nature: "own-transfer" }).title).toBe("Transferência própria");
    expect(rowTitle("InternalTransfer", 300, undefined, { nature: "income", origin: "other-income" }).title).toBe("Transferência recebida");
    expect(rowTitle("InternalTransfer", -300).title).toBe("Transferência enviada");
    expect(rowTitle("InternalTransfer", 300, undefined, { nature: "income", origin: "salary" }).original).toBe("InternalTransfer");
  });
});
