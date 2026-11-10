import { describe, expect, it } from "vitest";
import { billKnown, billPaidOn } from "./billPaid";

const b = (id: string, dueDate: string, totalAmount: number, payments?: unknown) => ({
  id,
  dueDate: `${dueDate}T00:00:00.000Z`,
  totalAmount,
  extra: JSON.stringify(payments === undefined ? {} : { payments }),
});

describe("regra de fatura paga (a mesma para a dívida ao vivo e para a curva estimada)", () => {
  it("pagamentos que cobrem o total: paga", () => {
    expect(billPaidOn(b("x", "2026-10-05", 100, [{ amount: 100 }]), "2026-11-09")).toBe(true);
  });

  it("pagamento parcial: não paga, mesmo vencida", () => {
    expect(billPaidOn(b("x", "2026-10-05", 100, [{ amount: 40 }]), "2026-11-09")).toBe(false);
  });

  it("sem informação de pagamento (ausente ou []): vencida conta como paga, a vencer não", () => {
    for (const payments of [undefined, []]) {
      expect(billPaidOn(b("x", "2026-10-05", 100, payments), "2026-11-09")).toBe(true);
      expect(billPaidOn(b("x", "2026-11-20", 100, payments), "2026-11-09")).toBe(false);
    }
  });

  it("no dia do vencimento ainda não conta como paga sem informação", () => {
    expect(billPaidOn(b("x", "2026-11-09", 100, []), "2026-11-09")).toBe(false);
    expect(billPaidOn(b("x", "2026-11-09", 100, []), "2026-11-10")).toBe(true);
  });

  it("compra de fatura desconhecida não é devida por padrão", () => {
    const bills = [b("known", "2026-11-20", 100, [])];
    expect(billKnown("unknown", bills)).toBe(false);
    expect(billKnown("known", bills)).toBe(true);
    expect(billKnown(undefined, bills)).toBe(true);
  });
});
