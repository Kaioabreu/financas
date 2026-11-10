import { describe, expect, it } from "vitest";
import { pixLabel } from "./pixLabel";

describe("pixLabel", () => {
  it("Pix enviado a pessoa: primeiro e último nome", () => {
    const r = pixLabel("Pix enviado MARIA DE FATIMA SOUZA LIMA", -10);
    expect(r).toMatchObject({ title: "Pix para Maria Lima", kind: "pix-sent", name: "Maria Lima" });
    expect(r.original).toBe("Pix enviado MARIA DE FATIMA SOUZA LIMA");
    expect(pixLabel("Pix enviado JOAO da SILVA", -1).title).toBe("Pix para Joao Silva");
  });
  it("Pix recebido", () => {
    expect(pixLabel("Pix recebido ANA SOUZA", 5).title).toBe("Pix de Ana Souza");
    expect(pixLabel("Transferência Recebida|ANA SOUZA", 5)).toMatchObject({ title: "Pix de Ana Souza", kind: "pix-received" });
  });
  it("transferência enviada pelo Pix com pipe", () => {
    expect(pixLabel("Transferência enviada pelo Pix|PAULO ROBERTO", -5).title).toBe("Pix para Paulo Roberto");
  });
  it("QR Pix de comércio", () => {
    expect(pixLabel("Pagamento com QR Pix PADARIA BOM PAO LTDA", -9)).toMatchObject({ title: "Pix QR · Padaria Bom", kind: "pix-qr" });
  });
  it("devolução", () => {
    expect(pixLabel("Devolução de Pix enviado ANA SOUZA", 3)).toMatchObject({ title: "Devolução · Ana Souza", kind: "pix-refund" });
    expect(pixLabel("Devolução de Pix", 3).title).toBe("Devolução de Pix");
  });
  it("Pix sem nome segue o sinal", () => {
    expect(pixLabel("Pix", -3).title).toBe("Pix enviado");
    expect(pixLabel("Pix", 3).title).toBe("Pix recebido");
    expect(pixLabel("Pix enviado", -3).title).toBe("Pix enviado");
  });
  it("boleto", () => {
    expect(pixLabel("Pagamento efetuado|ENERGIA SUL SA", -80)).toMatchObject({ title: "Boleto · Energia Sul", kind: "boleto" });
    expect(pixLabel("Pagamento efetuado", -80).title).toBe("Boleto");
  });
  it("outras descrições passam como estão, para a limpeza de estabelecimento", () => {
    expect(pixLabel("MERCADO TESTE", -1)).toMatchObject({ title: "MERCADO TESTE", kind: "other" });
  });
});
