import { describe, expect, it } from "vitest";
import { SGS_BASE } from "./estimate";
import {
  account,
  authResponse,
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
const BANK = "22222222-0000-0000-0000-000000000001";
const NEVER = new Promise<void>(() => {});
const DAY = 86_400_000;
const CDI_URL = `${SGS_BASE}/bcdata.sgs.4391/dados`;

let counter = 0;
const bankTx = (date: string, overrides: Record<string, unknown>) =>
  transaction({ id: `44444444-0000-0000-0000-${String(++counter).padStart(12, "0")}`, accountId: BANK, date: `${date}T12:00:00.000Z`, category: null, categoryId: null, ...overrides } as never);
const carteira = (value: number) => ({ ...investment({ balance: value } as never), amountWithdrawal: value });

/** A world whose clock starts on `startAt`; `read` syncs the carteira and bank transactions as given. */
async function world(startAt: string) {
  const w = await createTestWorld({ startAt });
  const state = { value: 0, txs: [] as object[] };
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item({ lastUpdatedAt: new Date(w.clock.now()).toISOString() } as never) }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account({ balance: 0 } as never)]) });
  w.fetch.on("GET", `${API}/v2/transactions`, () => ({ body: { results: state.txs, next: null } }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, () => ({ body: page(state.value ? [carteira(state.value)] : []) }));
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  return {
    ...w,
    /** The carteira is worth `value` now; read it. */
    async read(value: number, txs: object[] = state.txs) {
      state.value = value;
      state.txs = txs;
      await w.core.readConnection(ITEM_ID);
    },
    /** Moves the clock to `day` (noon). */
    goTo(day: string) {
      w.clock.advance(Date.parse(`${day}T12:00:00.000Z`) - w.clock.now());
    },
    cdi(rows: [string, string][]) {
      w.fetch.on("GET", CDI_URL, { body: rows.map(([data, valor]) => ({ data, valor })) });
    },
  };
}

describe("Rentabilidade: o mês", () => {
  it("com aporte, a valorização não conta o aporte", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    w.cdi([["01/10/2026", "1.00"]]);
    await w.read(1000);
    w.goTo("2026-10-31");
    await w.read(1350, [bankTx("2026-10-10", { amount: -300, description: "COMPRA DE TESOURO SELIC" })]);
    w.goTo("2026-11-09");

    const { month } = await w.core.performance("2026-10");

    expect(month.netContribution).toBe(300);
    expect(month.appreciation).toBe(50);
    expect(month.rentability).toBeCloseTo(0.05, 10);
    expect(month.cdi).toBeCloseTo(0.01, 10);
    expect(month.estimated).toBe(false);
  });

  it("com resgate, o aporte líquido fica negativo e a valorização não muda", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    await w.read(1000);
    w.goTo("2026-10-31");
    await w.read(650, [bankTx("2026-10-10", { type: "CREDIT", amount: 400, description: "VENDA DE TESOURO DIRETO" })]);
    w.goTo("2026-11-09");

    const { month } = await w.core.performance("2026-10");

    expect(month.netContribution).toBe(-400);
    expect(month.appreciation).toBe(50);
    expect(month.rentability).toBeCloseTo(0.05, 10);
  });

  it("com proventos, eles somam à rentabilidade", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    await w.read(1000);
    w.goTo("2026-10-31");
    await w.read(1020, [bankTx("2026-10-12", { type: "CREDIT", amount: 10, description: "JCP SINTETICO" })]);
    w.goTo("2026-11-09");

    const { month } = await w.core.performance("2026-10");

    expect(month.proceeds).toBe(10);
    expect(month.appreciation).toBe(20);
    expect(month.rentability).toBeCloseTo(0.03, 10);
  });

  it("o mês corrente usa o valor de hoje", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    await w.read(1000);
    w.goTo("2026-10-15");
    await w.read(1100);
    expect((await w.core.performance()).month).toMatchObject({ month: "2026-10", appreciation: 100 });
  });

  it("sem a série do CDI, o CDI vem vazio e a rentabilidade continua", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    await w.read(1000);
    w.goTo("2026-10-31");
    await w.read(1100);
    const { month } = await w.core.performance("2026-10");
    expect(month.cdi).toBeNull();
    expect(month.rentability).toBeCloseTo(0.1, 10);
  });
});

describe("Rentabilidade: o ano", () => {
  it("compõe os meses da rentabilidade e do CDI desde janeiro", async () => {
    const w = await world("2026-01-31T12:00:00.000Z");
    w.cdi([["01/01/2026", "1.00"], ["01/02/2026", "2.00"], ["01/03/2026", "3.00"]]);
    await w.read(1000);
    w.goTo("2026-02-28");
    await w.read(1100);
    w.goTo("2026-03-31");
    await w.read(1210);

    const { year } = await w.core.performance("2026-03");

    expect(year.rentability).toBeCloseTo(1.1 * 1.1 - 1, 10); // Jan is flat in the estimate, Feb and Mar are +10%
    expect(year.cdi).toBeCloseTo(1.01 * 1.02 * 1.03 - 1, 10);
  });
});

describe("Rentabilidade: a marca de estimada", () => {
  it("o mês que começa no trecho estimado vem marcado, e o real não", async () => {
    const w = await world("2026-09-30T12:00:00.000Z");
    await w.read(1000);
    w.goTo("2026-10-31");
    await w.read(1100);
    w.goTo("2026-11-09");

    expect((await w.core.performance("2026-08")).month.estimated).toBe(true);
    expect((await w.core.performance("2026-09")).month.estimated).toBe(true); // starts at an estimated Retrato
    expect((await w.core.performance("2026-10")).month.estimated).toBe(false);
  });
});
