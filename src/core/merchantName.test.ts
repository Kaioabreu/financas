import { describe, expect, it } from "vitest";
import { embeddedConfig } from "./config";
import { cleanMerchantName } from "./merchantName";

const clean = (raw: string) => cleanMerchantName(raw, embeddedConfig.merchantAliases);

describe("cleanMerchantName", () => {
  it("known aliases win over the raw text", () => {
    expect(clean("MERCADOLIVRE*MERC")).toBe("Mercado Livre");
    expect(clean("Amazon Brsão Paulobra")).toBe("Amazon");
    expect(clean("Uber UBER *TRIP HELP.USAO PAULOBRA")).toBe("Uber");
    expect(clean("Metro Rjrio De Janeirbra")).toBe("Metrô Rio");
    expect(clean("NETFLIX.COM")).toBe("Netflix");
    expect(clean("99 *POP")).toBe("99");
  });
  it("an alias does not match a longer number", () => {
    expect(clean("99999 LOJA TESTE")).not.toBe("99");
  });
  it("strips the acquirer prefix and the glued city", () => {
    expect(clean("EC *SAMSUNGSAO PAULOBRA")).toBe("Samsung");
    expect(clean("PAG*LOJA TESTE")).toBe("Loja Teste");
  });
  it("unknown names: Title Case, ids dropped, text before the star kept", () => {
    expect(clean("PADARIA BOM PAO 12345678 SAO PAULO BRA")).toBe("Padaria Bom Pao");
    expect(clean("QUITANDA TESTE*PEDIDO")).toBe("Quitanda Teste");
  });
  it("keeps accents and mixed case of unknown names", () => {
    expect(clean("Açaí da Praça")).toBe("Açaí da Praça");
  });
  it("never returns empty", () => {
    expect(clean("EC *")).toBe("EC *");
    expect(clean("   ")).toBe("");
    expect(clean("SAO PAULO")).toBe("Sao Paulo");
  });
});
