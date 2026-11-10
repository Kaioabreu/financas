import { describe, expect, it } from "vitest";
import {
  authResponse,
  bill,
  creditCard,
  identity,
  item,
  page,
  SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENT_SECRET,
  transaction,
} from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const API = "https://api.pluggy.ai";
const ITEM_ID = "11111111-0000-0000-0000-000000000001";
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const day = (d: string) => `${d}T12:00:00.000Z`;

let counter = 0;
const tid = () => `44444444-0000-0000-0000-${String(++counter).padStart(12, "0")}`;

// Synthetic timeline (the clock starts on 2026-11-09). A bill closes 7 days before it is due.
//   b1 due 09-05 (first)  b2 due 10-05  b3 due 11-05  b4 due 11-20 (still open)
// b2 expects 300 (800 - 500), b3 expects 200 (1000 - 800).
const BILLS = [
  bill({ id: "b1", dueDate: day("2026-09-05"), totalAmount: 500 }),
  bill({ id: "b2", dueDate: day("2026-10-05"), totalAmount: 800 }),
  bill({ id: "b3", dueDate: day("2026-11-05"), totalAmount: 1000 }),
  bill({ id: "b4", dueDate: day("2026-11-20"), totalAmount: 5000 }),
];

const buy = (amount: number, date: string, billId: string, extra: Record<string, unknown> = {}) =>
  transaction({
    id: tid(),
    accountId: CARD,
    type: "DEBIT",
    amount,
    description: "COMPRA SINTETICA",
    date: day(date),
    creditCardMetadata: { installmentNumber: 1, totalInstallments: 1, totalAmount: amount, purchaseDate: day(date), billId },
    ...extra,
  } as never);
const credit = (description: string, amount: number, date: string, billId: string, extra: Record<string, unknown> = {}) =>
  transaction({
    id: tid(),
    accountId: CARD,
    type: "CREDIT",
    amount: -amount,
    description,
    category: null,
    categoryId: null,
    date: day(date),
    creditCardMetadata: { installmentNumber: 1, totalInstallments: 1, totalAmount: amount, purchaseDate: day(date), billId },
    ...extra,
  } as never);
const parcel = (k: number, total: number, amount: number, purchase: string, billId: string, store = "LOJA X") =>
  transaction({
    id: tid(),
    accountId: CARD,
    type: "DEBIT",
    amount,
    description: store,
    date: day(purchase),
    creditCardMetadata: { installmentNumber: k, totalInstallments: total, totalAmount: amount * total, purchaseDate: day(purchase), billId },
  } as never);

/** b2 is matched by one purchase of 300 unless the test says otherwise. */
const b2ok = () => buy(300, "2026-09-10", "b2");

async function world(state: { txs: object[]; cardName?: string; bills?: object[] }) {
  const w = await createTestWorld();
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item() }));
  w.fetch.on("GET", `${API}/accounts`, () => ({ body: page([creditCard({ name: state.cardName ?? "Cartão Nubank" })]) }));
  w.fetch.on("GET", `${API}/v2/transactions`, () => ({ body: { results: state.txs, next: null } }));
  w.fetch.on("GET", `${API}/bills`, () => ({ body: page(state.bills ?? BILLS) }));
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  await w.core.readConnection(ITEM_ID);
  return w;
}
/** b3's gaps: its cycle runs 29/09 to 29/10. */
const gapsOf = async (w: Awaited<ReturnType<typeof world>>) => (await w.core.billGaps({ month: "2026-10" })).filter((g) => g.billId === "b3");

describe("Lacuna: a conta da fatura", () => {
  it("a fatura que bate não tem lacuna", async () => {
    const w = await world({ txs: [b2ok(), buy(150, "2026-10-02", "b3"), buy(50, "2026-10-20", "b3")] });
    expect(await w.core.billGaps({ month: "2026-10" })).toEqual([]);
  });

  it("a fatura que não bate mostra o valor exato e o ciclo", async () => {
    const w = await world({ txs: [b2ok(), buy(150, "2026-10-02", "b3")] });
    const [gap] = await gapsOf(w);
    expect(gap).toMatchObject({ amount: 50, kind: "missing", from: "2026-09-29", to: "2026-10-29", cardName: "Cartão Nubank" });
    expect(gap!.text).toBe("Faltam R$ 50,00 do Cartão Nubank, compras de 29/09 a 29/10");
  });

  it("a nota aparece em cada mês que o ciclo toca, e só nele", async () => {
    const w = await world({ txs: [b2ok(), buy(150, "2026-10-02", "b3")] });
    expect((await w.core.billGaps({ month: "2026-09" })).length).toBe(1);
    expect((await w.core.billGaps({ month: "2026-10" })).length).toBe(1);
    expect(await w.core.billGaps({ month: "2026-11" })).toEqual([]);
    expect(await w.core.billGaps({ month: "2026-10", accountId: CARD })).toHaveLength(1);
    expect(await w.core.billGaps({ month: "2026-10", accountId: "outro" })).toEqual([]);
  });

  it("todo crédito entra negativo", async () => {
    const w = await world({ txs: [b2ok(), buy(250, "2026-10-02", "b3"), credit("ESTORNO SINTETICO", 50, "2026-10-03", "b3")] });
    expect(await gapsOf(w)).toEqual([]);
  });

  it("lacuna negativa diz 'a mais'", async () => {
    const w = await world({ txs: [b2ok(), buy(250, "2026-10-02", "b3")] });
    const [gap] = await gapsOf(w);
    expect(gap).toMatchObject({ amount: 50, kind: "extra" });
    expect(gap!.text).toBe("Há R$ 50,00 a mais no Cartão Nubank, compras de 29/09 a 29/10");
  });

  it("correção: a parcela adiantada vai para a fatura do seu desconto", async () => {
    const w = await world({
      txs: [
        b2ok(),
        buy(105, "2026-10-02", "b3"),
        parcel(3, 3, 100, "2026-09-20", "b4"), // natural date in November, prepaid in October
        credit("Desconto na Parcela 3 de 3 LOJA X", 5, "2026-10-10", "b3"),
      ],
    });
    expect(await gapsOf(w)).toEqual([]);
  });

  it("correção: as parcelas canceladas vão para a fatura dos estornos", async () => {
    const w = await world({
      txs: [
        b2ok(),
        buy(160, "2026-10-02", "b3"),
        parcel(1, 3, 40, "2026-10-01", "b3", "LOJA Y"),
        parcel(2, 3, 40, "2026-10-01", "b4", "LOJA Y"),
        parcel(3, 3, 40, "2026-10-01", "b4", "LOJA Y"),
        credit("Canc Parcela LOJA Y", 40, "2026-10-20", "b3"),
        credit("Canc Parcela LOJA Y", 40, "2026-10-20", "b3"),
      ],
    });
    expect(await gapsOf(w)).toEqual([]);
  });

  it("correção: o pagamento depois do fechamento vai para a fatura seguinte", async () => {
    // b2 closed on 09-28; its payment on 10-06 shows up in b3.
    const w = await world({
      txs: [
        buy(300, "2026-09-10", "b2"),
        credit("PAGAMENTO RECEBIDO", 300, "2026-10-06", "b2", { category: "Credit card payment" }),
        buy(500, "2026-10-02", "b3"),
      ],
    });
    expect(await w.core.billGaps({ month: "2026-09" })).toEqual([]);
    expect(await gapsOf(w)).toEqual([]);
  });

  it("correção: a compra em moeda estrangeira usa o valor na moeda da conta", async () => {
    const w = await world({
      txs: [b2ok(), buy(150, "2026-10-02", "b3"), buy(20, "2026-10-04", "b3", { currencyCode: "USD", amountInAccountCurrency: 50 })],
    });
    expect(await gapsOf(w)).toEqual([]);
  });

  it("não verifica a fatura aberta nem a primeira de cada cartão", async () => {
    // b1 (first) and b4 (open, due 11-20) have totals but no transactions at all.
    const w = await world({ txs: [b2ok(), buy(200, "2026-10-02", "b3")] });
    for (const month of ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) expect(await w.core.billGaps({ month })).toEqual([]);
  });

  it("não verifica antes do vencimento", async () => {
    const w = await world({ txs: [b2ok()] }); // b3 has nothing, but is due on 11-05
    expect(await gapsOf(w)).toHaveLength(1);
    w.clock.advance(-10 * 24 * 3_600_000); // 2026-10-30: b3 is not due yet
    expect(await gapsOf(w)).toEqual([]);
  });

  it("nomeia a parcela quando a lacuna é exatamente uma parcela que falta", async () => {
    const w = await world({
      txs: [
        buy(100, "2026-10-02", "b3"),
        parcel(1, 10, 100, "2026-09-15", "b2", "LOJA Z"),
        parcel(3, 10, 100, "2026-09-15", "b4", "LOJA Z"),
        buy(200, "2026-09-12", "b2"),
      ],
    });
    const [gap] = await gapsOf(w);
    expect(gap!.amount).toBe(100);
    expect(gap!.installment).toEqual({ number: 2, total: 10, store: "LOJA Z" });
    expect(gap!.text).toContain("Faltou a parcela 2 de 10 de LOJA Z");
  });

  it("a lacuna some quando o Pluggy entrega o que faltava", async () => {
    const state = { txs: [b2ok(), buy(150, "2026-10-02", "b3")] };
    const w = await world(state);
    expect(await gapsOf(w)).toHaveLength(1);
    state.txs.push(buy(50, "2026-10-20", "b3"));
    await w.core.readConnection(ITEM_ID);
    expect(await gapsOf(w)).toEqual([]);
  });

  describe("fechamento que varia, vindo do Pluggy", () => {
    // Closings 26/08, 26/09, 27/10 (the 7-day guess would say 25/08, 24/09, 25/10).
    const VARIABLE = [
      bill({ id: "b1", dueDate: day("2026-09-01"), totalAmount: 500, billClosingDate: day("2026-08-26") }),
      bill({ id: "b2", dueDate: day("2026-10-01"), totalAmount: 800, billClosingDate: day("2026-09-26") }),
      bill({ id: "b3", dueDate: day("2026-11-01"), totalAmount: 1000, billClosingDate: day("2026-10-27") }),
    ];

    it("o ciclo vai do dia seguinte ao fechamento anterior até o fechamento da fatura", async () => {
      const w = await world({ bills: VARIABLE, txs: [b2ok(), buy(150, "2026-10-02", "b3")] });
      const [gap] = await gapsOf(w);
      expect(gap).toMatchObject({ amount: 50, from: "2026-09-27", to: "2026-10-27" });
      expect(gap!.text).toBe("Faltam R$ 50,00 do Cartão Nubank, compras de 27/09 a 27/10");
    });

    it("o pagamento antes do fechamento real, mas depois do palpite de 7 dias, fica na própria fatura e a lacuna some", async () => {
      const w = await world({
        bills: VARIABLE,
        txs: [
          buy(600, "2026-09-10", "b2"),
          credit("PAGAMENTO RECEBIDO", 300, "2026-09-25", "b2", { category: "Credit card payment" }),
          buy(200, "2026-10-02", "b3"),
        ],
      });
      expect(await w.core.billGaps({ month: "2026-09" })).toEqual([]);
      expect(await gapsOf(w)).toEqual([]);
    });

    it("sem billClosingDate numa fatura, vale o palpite de 7 dias antes do vencimento", async () => {
      const bills = [VARIABLE[0], VARIABLE[1], bill({ id: "b3", dueDate: day("2026-11-01"), totalAmount: 1000 })];
      const w = await world({ bills, txs: [b2ok(), buy(150, "2026-10-02", "b3")] });
      const [gap] = await gapsOf(w);
      expect(gap).toMatchObject({ from: "2026-09-27", to: "2026-10-25" }); // 01/11 minus 7 days
    });
  });

  it("BTG fica fora: o totalAmount do Pluggy não é o total real, então nenhuma nota, só contagens", async () => {
    const w = await world({ txs: [b2ok(), buy(150, "2026-10-02", "b3")], cardName: "Cartão BTG" });
    expect(await w.core.billGaps({ month: "2026-10" })).toEqual([]);
    expect(await w.core.diagnostic()).toContain("Cartão 1: faturas verificadas 2 · batem 1 · não batem 1");
  });

  it("banco fora da lista: nenhuma nota, só contagens no diagnóstico", async () => {
    const w = await world({ txs: [b2ok(), buy(150, "2026-10-02", "b3")], cardName: "Cartão Outro Banco" });
    expect(await w.core.billGaps({ month: "2026-10" })).toEqual([]);
    const text = await w.core.diagnostic();
    expect(text).toContain("Cartão 1: faturas verificadas 2 · batem 1 · não batem 1");
    expect(text).not.toMatch(/50,00|50\.00|Outro Banco/);
  });
});
