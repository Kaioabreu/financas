import { describe, expect, it } from "vitest";
import {
  account,
  authResponse,
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
const BANK = "22222222-0000-0000-0000-000000000001";
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const USER_CPF = "52998224725";
const tid = (n: number) => `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`;

let counter = 0;
const tx = (overrides: Record<string, unknown> = {}) =>
  transaction({ id: tid(++counter), date: "2026-10-20T12:00:00.000Z", category: null, categoryId: null, ...overrides } as never);
const bankTx = (overrides: Record<string, unknown>) => tx({ accountId: BANK, ...overrides });
const cardTx = (overrides: Record<string, unknown>) => tx({ accountId: CARD, type: "DEBIT", ...overrides });
const day = (d: string) => `${d}T12:00:00.000Z`;

/** The clock starts on 2026-11-09. */
async function world(bank: object[], card: object[] = []) {
  const w = await createTestWorld();
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item() }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => ({
    body: { results: call.url.includes(`accountId=${CARD}`) ? card : bank, next: null },
  }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity({ document: USER_CPF })]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  await w.core.readConnection(ITEM_ID);
  return w;
}

describe("Resumo: o saldo e o aporte líquido", () => {
  it("o saldo é receitas menos gastos; o aporte aparece ao lado e não entra no saldo", async () => {
    const w = await world([
      bankTx({ type: "CREDIT", amount: 5000, operationType: "FOLHA_PAGAMENTO" }),
      bankTx({ type: "CREDIT", amount: 40, description: "PIX AMIGO" }),
      bankTx({ type: "CREDIT", amount: 7, description: "JCP SINTETICO" }),
      bankTx({ amount: -1200, description: "ALUGUEL" }),
      bankTx({ amount: -300, description: "COMPRA DE TESOURO SELIC" }),
      bankTx({ type: "CREDIT", amount: 100, description: "VENDA DE TESOURO DIRETO" }),
    ]);
    const m = await w.core.monthSummary("2026-10");
    expect(m.income).toEqual({ total: 5047, byOrigin: { salary: 5000, yield: 7, "other-income": 40 } });
    expect(m.expenses).toBe(1200);
    expect(m.balance).toBe(3847);
    expect(m.contributions).toBe(300);
    expect(m.redemptions).toBe(100);
    expect(m.netContribution).toBe(200);
  });

  it("o aporte líquido fica negativo quando se resgata mais do que se aporta", async () => {
    const w = await world([bankTx({ type: "CREDIT", amount: 900, description: "VENDA DE TESOURO DIRETO" })]);
    expect((await w.core.monthSummary("2026-10")).netContribution).toBe(-900);
  });

  it("transferência própria, pagamento de fatura e empréstimo pessoal não contam", async () => {
    const w = await world(
      [
        bankTx({ amount: -500, description: "PIX PRA MIM", operationType: "PIX", paymentData: { receiver: { documentNumber: { type: "CPF", value: USER_CPF } } } }),
        bankTx({ amount: -250, description: "PAGAMENTO FATURA", operationType: "PAGAMENTO_FATURA", category: "Credit card payment" }),
      ],
      [cardTx({ type: "CREDIT", amount: 250, description: "PAGAMENTO RECEBIDO", operationType: "PAGAMENTO_FATURA", category: "Credit card payment" })],
    );
    const m = await w.core.monthSummary("2026-10");
    expect(m.income.total).toBe(0);
    expect(m.expenses).toBe(0);
    expect(m.balance).toBe(0);
  });
});

describe("Resumo: o dia e o mês de cada caso", () => {
  it("a compra no cartão conta no dia da compra, não no mês da fatura", async () => {
    const w = await world([], [cardTx({ amount: 80, date: day("2026-09-30"), description: "COMPRA" })]);
    expect((await w.core.monthSummary("2026-09")).expenses).toBe(80);
    expect((await w.core.monthSummary("2026-10")).expenses).toBe(0);
  });

  it("uma data futura só conta quando chega", async () => {
    const w = await world([bankTx({ amount: -50, date: day("2026-11-20") }), bankTx({ amount: -20, date: day("2026-11-09") })]);
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(20);
    w.clock.advance(11 * 24 * 3_600_000);
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(70);
  });

  it("uma PENDING com data até hoje já conta", async () => {
    const w = await world([bankTx({ amount: -33, status: "PENDING", date: day("2026-11-08") })]);
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(33);
  });

  it("o reembolso conta no mês em que entra", async () => {
    const w = await world([
      bankTx({ amount: -100, category: "Groceries", date: day("2026-09-28") }),
      bankTx({ type: "CREDIT", amount: 40, description: "ESTORNO LOJA", operationType: "ESTORNO", date: day("2026-10-03") }),
    ]);
    expect((await w.core.monthSummary("2026-09")).expenses).toBe(100);
    expect((await w.core.monthSummary("2026-10")).expenses).toBe(0);
  });
});

describe("Resumo: o reembolso", () => {
  const refundCard = (extra: Record<string, unknown>) =>
    cardTx({ type: "CREDIT", amount: -30, description: "ESTORNO LOJA", operationType: "ESTORNO", ...extra });

  it("com categoria, abate dela e do total", async () => {
    const w = await world([], [
      cardTx({ amount: 100, category: "Groceries", description: "MERCADO" }),
      cardTx({ amount: 50, category: "Restaurants", description: "JANTAR" }),
      refundCard({ category: "Groceries" }),
    ]);
    const m = await w.core.monthSummary("2026-10");
    expect(m.categories).toEqual([
      { category: "groceries", amount: 70 },
      { category: "food", amount: 50 },
    ]);
    expect(m.expenses).toBe(120);
    expect(m.uncategorizedRefunds).toBe(0);
  });

  it("sem categoria, abate só do total e fica avisado à parte", async () => {
    const w = await world([], [cardTx({ amount: 100, category: "Groceries", description: "MERCADO" }), refundCard({})]);
    const m = await w.core.monthSummary("2026-10");
    expect(m.categories).toEqual([{ category: "groceries", amount: 100 }]);
    expect(m.uncategorizedRefunds).toBe(30);
    expect(m.expenses).toBe(70);
    expect(m.balance).toBe(-70);
  });
});

describe("Gastos por semana", () => {
  it("vão de segunda a domingo, cortadas nas bordas do mês", async () => {
    const w = await world([]);
    const m = await w.core.monthSummary("2026-10"); // the 1st is a Thursday
    expect(m.weeks.map((x) => [x.startDay, x.endDay])).toEqual([[1, 4], [5, 11], [12, 18], [19, 25], [26, 31]]);
  });

  it("somam o mês, com o reembolso na semana em que entra", async () => {
    const w = await world(
      [
        bankTx({ amount: -10, date: day("2026-10-01") }),
        bankTx({ amount: -20, date: day("2026-10-04") }),
        bankTx({ amount: -30, date: day("2026-10-05") }),
        bankTx({ amount: -40, date: day("2026-10-31") }),
      ],
      [cardTx({ type: "CREDIT", amount: -5, description: "CASHBACK", operationType: "CASHBACK", date: day("2026-10-12") })],
    );
    const m = await w.core.monthSummary("2026-10");
    expect(m.weeks.map((x) => x.total)).toEqual([30, 30, -5, 0, 40]);
    expect(m.weeks.reduce((s, x) => s + x.total, 0)).toBe(m.expenses);
  });
});

describe("Últimos seis meses", () => {
  it("traz seis meses terminando no escolhido, do mais antigo ao mais novo", async () => {
    const w = await world([
      bankTx({ type: "CREDIT", amount: 1000, operationType: "FOLHA_PAGAMENTO", date: day("2026-08-05") }),
      bankTx({ amount: -400, date: day("2026-08-06") }),
      bankTx({ amount: -90, date: day("2026-10-06") }),
    ]);
    const h = await w.core.monthHistory("2026-10");
    expect(h.map((p) => p.month)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(h[3]).toEqual({ month: "2026-08", income: 1000, expenses: 400, balance: 600 });
    expect(h[5]).toEqual({ month: "2026-10", income: 0, expenses: 90, balance: -90 });
  });
});

describe("Transações filtradas", () => {
  it("por categoria, em todas as contas, mostra o que o Gastos somou", async () => {
    const w = await world(
      [bankTx({ amount: -10, category: "Groceries" }), bankTx({ amount: -99, category: "Travel" })],
      [cardTx({ amount: 20, category: "Groceries" })],
    );
    const rows = await w.core.listTransactions({ month: "2026-10", category: "groceries" });
    expect(rows.map((r) => r.amount).sort((a, b) => a - b)).toEqual([-10, 20]);
  });

  it("por semana mostra só os gastos daqueles dias", async () => {
    const w = await world([bankTx({ amount: -10, date: day("2026-10-02") }), bankTx({ amount: -20, date: day("2026-10-07") })]);
    const rows = await w.core.listTransactions({ month: "2026-10", days: { from: 5, to: 11 } });
    expect(rows.map((r) => r.amount)).toEqual([-20]);
  });
});
