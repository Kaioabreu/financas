import { describe, expect, it } from "vitest";
import {
  account,
  authResponse,
  bill,
  creditCard,
  identity,
  investment,
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
const DAY = 86_400_000;

interface Setup {
  accounts?: object[];
  investments?: object[];
  txs?: object[];
  bills?: object[];
  resources?: object[];
  item?: object;
}

/** A world with one Connection; `read` syncs whatever the fake Pluggy holds right now. */
async function world(startAt = "2026-11-09T12:00:00.000Z") {
  const w = await createTestWorld({ startAt });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const state: Required<Setup> = {
    accounts: [account()],
    investments: [],
    txs: [],
    bills: [],
    resources: [],
    item: item({ lastUpdatedAt: "2020-01-01T00:00:00.000Z" }),
  };
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: state.item }));
  w.fetch.on("GET", `${API}/items/${ITEM_ID}/resources`, () => ({ body: page(state.resources) }));
  w.fetch.on("GET", `${API}/accounts`, () => ({ body: page(state.accounts) }));
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => ({
    body: { results: call.url.includes(`accountId=${CARD}`) ? state.txs : [], next: null },
  }));
  w.fetch.on("GET", `${API}/bills`, () => ({ body: page(state.bills) }));
  w.fetch.on("GET", `${API}/investments`, () => ({ body: page(state.investments) }));
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  await w.core.readConnection(ITEM_ID);
  let n = 0;
  return {
    ...w,
    state,
    /** Pluggy has new data; read it. */
    async read(setup: Setup = {}) {
      Object.assign(state, setup);
      state.item = item({ lastUpdatedAt: new Date(w.clock.now()).toISOString(), ...(setup.item ?? {}) } as never);
      n++;
      await w.core.sync({ manual: true });
      return n;
    },
  };
}

const bank = (balance: number, bankData: Record<string, unknown> = {}, reservedBalances: unknown[] = []) =>
  account({ balance, bankData: { transferNumber: "x", closingBalance: balance, ...bankData }, reservedBalances } as never);
const inv = (id: number, type: string, amountWithdrawal: number, balance = amountWithdrawal + 100) =>
  ({ ...investment({ id: `55555555-0000-0000-0000-${String(id).padStart(12, "0")}`, type, balance } as never), amountWithdrawal });
const buy = (id: number, amount: number, date: string, billId: string | null = null) =>
  transaction({
    id: `44444444-0000-0000-0000-${String(id).padStart(12, "0")}`,
    accountId: CARD,
    type: "DEBIT",
    amount,
    date,
    creditCardMetadata: billId ? { installmentNumber: 1, totalInstallments: 1, totalAmount: amount, purchaseDate: date, billId } : null,
  } as never);

describe("Patrimônio: classes", () => {
  it("usa o valor de resgate, separa as classes e some com as vazias", async () => {
    const w = await world();
    await w.read({
      accounts: [bank(1000)],
      investments: [
        inv(1, "FIXED_INCOME", 5000),
        inv(2, "EQUITY", 300),
        inv(3, "ETF", 200),
        inv(4, "MUTUAL_FUND", 700),
      ],
    });

    const view = await w.core.netWorth();

    expect(view.classes.map((c) => [c.class, c.value])).toEqual([
      ["cash", 1000],
      ["fixedIncome", 5000],
      ["equity", 500],
      ["funds", 700],
    ]);
    expect(view.total).toBe(7200);
    expect(view.debt).toBe(0);
  });

  it("manda o tipo desconhecido para Outros", async () => {
    const w = await world();
    await w.read({ accounts: [bank(0)], investments: [inv(1, "COE", 80)] });
    expect((await w.core.netWorth()).classes).toEqual([{ class: "other", value: 80, share: 1 }]);
  });

  it("conta a conta remunerada uma vez só e põe os reservedBalances em Renda fixa", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1000, { automaticallyInvestedBalance: 900 }, [{ amount: 250 }])] });

    const view = await w.core.netWorth();

    expect(view.classes.map((c) => [c.class, c.value])).toEqual([
      ["cash", 1000],
      ["fixedIncome", 250],
    ]);
    expect(view.total).toBe(1250);
  });
});

describe("Patrimônio: dívida", () => {
  const card = (overrides: object = {}) => creditCard({ balance: 9999, ...overrides } as never);

  it("soma compras lançadas e não pagas, ignora data futura e fatura paga", async () => {
    const w = await world();
    await w.read({
      accounts: [bank(1000), card()],
      bills: [
        bill({ id: "b-paid", totalAmount: 100, dueDate: "2026-10-05T00:00:00.000Z", payments: [{ amount: 100 }] } as never),
        bill({ id: "b-open", totalAmount: 300, dueDate: "2026-11-20T00:00:00.000Z", payments: [] } as never),
      ],
      txs: [
        buy(1, 100, "2026-09-20T12:00:00.000Z", "b-paid"),
        buy(2, 120, "2026-11-02T12:00:00.000Z", "b-open"),
        buy(3, 80, "2026-11-09T12:00:00.000Z"),
        buy(4, 500, "2026-12-09T12:00:00.000Z", "b-open"),
      ],
    });

    const view = await w.core.netWorth();

    expect(view.debt).toBe(-200);
    expect(view.total).toBe(800);
  });

  it("inclui o cheque especial usado", async () => {
    const w = await world();
    await w.read({ accounts: [bank(0, { overdraftUsedLimit: 150 })] });
    const view = await w.core.netWorth();
    expect(view.debt).toBe(-150);
    expect(view.total).toBe(-150);
  });
});

describe("Patrimônio: retratos e curva", () => {
  it("guarda um retrato por dia e vale o último", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1000)] });
    w.clock.advance(1000);
    await w.read({ accounts: [bank(1500)] });
    w.clock.advance(DAY * 40);
    await w.read({ accounts: [bank(2000)] });

    const view = await w.core.netWorth();
    // Only the November 9 Retrato (the last of that day) feeds the curve; today is December 19.
    expect(view.curve.map((p) => [p.month, p.total, p.today])).toEqual([
      ["2026-11", 1500, false],
      ["2026-12", 2000, true],
    ]);
    expect(view.variation).toBe(500);
  });

  it("um ponto por mês, com o último retrato do mês", async () => {
    const w = await world("2026-09-05T12:00:00.000Z");
    await w.read({ accounts: [bank(100)] });
    w.clock.advance(DAY * 20); // Sep 25
    await w.read({ accounts: [bank(300)] });
    w.clock.advance(DAY * 10); // Oct 5
    await w.read({ accounts: [bank(400)] });
    w.clock.advance(DAY * 40); // Nov 14
    await w.read({ accounts: [bank(900)] });

    const view = await w.core.netWorth();

    expect(view.curve.map((p) => [p.month, p.total])).toEqual([
      ["2026-09", 300],
      ["2026-10", 400],
      ["2026-11", 900],
    ]);
    expect(view.curve.at(-1)).toMatchObject({ today: true, total: 900 });
    expect(view.variation).toBe(500);
  });

  it("não grava retrato quando a leitura não traz dado novo", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1000)] });
    w.state.accounts = [bank(5)];
    await w.core.sync({ manual: true }); // lastUpdatedAt did not move
    w.clock.advance(DAY * 40);
    expect((await w.core.netWorth()).curve[0]).toMatchObject({ total: 1000 });
  });
});

describe("Patrimônio: Conexão vencida", () => {
  it("continua contando com o último retrato, marcado com a data", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1000)] });
    w.state.accounts = [bank(777)]; // would show if it were read again
    w.clock.advance(DAY * 400); // past consentExpiresAt (2027-01-10)

    const view = await w.core.netWorth();

    expect(view.total).toBe(1000);
    expect(view.banks[0]).toMatchObject({ valueDate: "2026-11-09" });
  });
});

describe("Patrimônio: pode faltar", () => {
  it("avisa quando um recurso está UNAVAILABLE", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1)], resources: [{ type: "ACCOUNT", status: "UNAVAILABLE" }] });
    expect((await w.core.netWorth()).banks[0]).toMatchObject({ mayBeMissing: true });
  });

  it("avisa quando há saldo reservado mas a lista veio vazia", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1, { hasReservedBalance: true })] });
    expect((await w.core.netWorth()).banks[0]).toMatchObject({ mayBeMissing: true });
  });

  it("não avisa quando tudo veio", async () => {
    const w = await world();
    await w.read({ accounts: [bank(1)], resources: [{ type: "ACCOUNT", status: "AVAILABLE" }] });
    expect((await w.core.netWorth()).banks[0]).toMatchObject({ mayBeMissing: false, valueDate: null });
  });
});
