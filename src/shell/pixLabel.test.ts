import { describe, expect, it } from "vitest";
import { pixLabel } from "./pixLabel";

describe("pixLabel (prototype)", () => {
  it("Pix enviado a pessoa: primeiro nome e inicial", () => {
    const r = pixLabel("Pix enviado MARIA DE FATIMA SOUZA LIMA", -10);
    expect(r.title).toBe("Pix para Maria L.");
    expect(r.kind).toBe("pix-sent");
    expect(r.original).toBe("Pix enviado MARIA DE FATIMA SOUZA LIMA");
  });
  it("estilo completo: primeiro e último nome", () => {
    expect(pixLabel("Pix enviado JOAO da SILVA", -1, { style: "full" }).title).toBe("Pix para Joao Silva");
  });
  it("Pix recebido", () => {
    expect(pixLabel("Pix recebido ANA SOUZA", 5).title).toBe("Pix de Ana S.");
    expect(pixLabel("Transferência Recebida|ANA SOUZA", 5)).toMatchObject({ title: "Pix de Ana S.", kind: "pix-received" });
  });
  it("transferência enviada pelo Pix com pipe", () => {
    expect(pixLabel("Transferência enviada pelo Pix|PAULO ROBERTO", -5).title).toBe("Pix para Paulo R.");
  });
  it("QR Pix de comércio", () => {
    const r = pixLabel("Pagamento com QR Pix PADARIA BOM PAO LTDA", -9);
    expect(r).toMatchObject({ title: "Pix QR · Padaria Bom", kind: "pix-qr" });
  });
  it("devolução", () => {
    expect(pixLabel("Devolução de Pix enviado ANA SOUZA", 3)).toMatchObject({ title: "Devolução · Ana S.", kind: "pix-refund" });
  });
  it("Pix sem nome segue o sinal", () => {
    expect(pixLabel("Pix", -3).title).toBe("Pix enviado");
    expect(pixLabel("Pix", 3).title).toBe("Pix recebido");
  });
  it("boleto", () => {
    expect(pixLabel("Pagamento efetuado|ENERGIA SUL SA", -80)).toMatchObject({ title: "Boleto · Energia Sul", kind: "boleto" });
    expect(pixLabel("Pagamento efetuado", -80).title).toBe("Boleto");
  });
  it("outras descrições: só limpeza leve", () => {
    expect(pixLabel("12345 MERCADO TESTE", -1).title).toBe("MERCADO TESTE");
    expect(pixLabel("LIQ BOLSA (Corretagem BTC Aluguel)", -1).title).toBe("LIQ BOLSA (Corretagem BTC Aluguel)");
  });
});
