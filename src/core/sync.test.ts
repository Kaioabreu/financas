import { describe, expect, it } from "vitest";
import {
  account,
  authResponse,
  bill,
  creditCard,
  identity,
  investment,
  investmentTransaction,
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
const MINUTE = 60_000;
const NEWER = "2026-11-06T06:00:00.000Z";
const tid = (n: number) => `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`;
const tx = (n: number, overrides: Record<string, unknown> = {}) =>
  transaction({ id: tid(n), description: `COMPRA ${n}`, ...overrides } as never);
/** Stable transactions that never change between reads, so a deletion stays under the 20% lock. */
const padding = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => tx(from + i, { date: "2026-10-12T12:00:00.000Z" }));

/** A world with one Connection already created (first read not yet done). */
async function world(config: Record<string, unknown> = {}) {
  const w = await createTestWorld({ config });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const state = {
    item: item() as Record<string, unknown>,
    txs: [] as object[][],
    cardTxs: [] as object[],
    failAtPage: null as number | null,
  };
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: state.item }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => {
    if (call.url.includes(`accountId=${CARD}`)) return { body: { results: state.cardTxs, next: null } };
    const after = /after=(\d+)/.exec(call.url);
    const i = after ? Number(after[1]) : 0;
    if (state.failAtPage === i) return { status: 500, body: {} };
    const next = i + 1 < state.txs.length ? `?accountId=${BANK}&after=${i + 1}` : null;
    return { body: { results: state.txs[i] ?? [], next } };
  });
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  return {
    ...w,
    state,
    setTxs: (...pages: object[][]) => (state.txs = pages),
    /** Pluggy has new data. */
    newData: (overrides: Record<string, unknown> = {}) => (state.item = item({ lastUpdatedAt: NEWER, ...overrides } as never)),
  };
}
type World = Awaited<ReturnType<typeof world>>;
const october = (w: World) => w.core.listTransactions({ accountId: BANK, month: "2026-10" });
const callsStarting = (w: World, prefix: string) => w.fetch.calls.filter((c) => c.method === "GET" && c.url.startsWith(prefix));
const accountReads = (w: World) => callsStarting(w, `${API}/accounts`).length;

describe("Sincronização: quando ler", () => {
  it("só lê quando o lastUpdatedAt é mais novo que a última leitura completa", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    await w.core.readConnection(ITEM_ID);
    const before = accountReads(w);

    await w.core.sync({ manual: true });
    expect(accountReads(w)).toBe(before);

    w.newData();
    await w.core.sync({ manual: true });
    expect(accountReads(w)).toBe(before + 1);
    expect((await w.core.listConnections())[0]).toMatchObject({ dataAt: NEWER });
  });

  it("lê de novo se a última tentativa não completou, mesmo sem dado novo", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    await w.core.readConnection(ITEM_ID);
    w.newData();
    w.fetch.on("GET", `${API}/investments`, { status: 400, body: {} });
    await w.core.sync({ manual: false });
    const afterFailure = accountReads(w);
    w.fetch.on("GET", `${API}/investments`, { body: page([]) });

    await w.core.sync({ manual: false });

    expect(accountReads(w)).toBe(afterFailure + 1);
  });

  it("traz todos os produtos, sem usar o /transactions antigo", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    w.fetch.on("GET", `${API}/bills`, { body: page([bill()]) });
    w.fetch.on("GET", `${API}/investments`, { body: page([investment()]) });
    w.fetch.on("GET", `${API}/investments/${investment().id}/transactions`, { body: page([investmentTransaction()]) });

    await w.core.readConnection(ITEM_ID);

    expect(w.fetch.calls.some((c) => c.url.startsWith(`${API}/transactions`))).toBe(false);
    expect(w.fetch.calls.find((c) => c.url.startsWith(`${API}/bills`))!.url).toContain(`accountId=${CARD}`);
    expect(w.fetch.calls.find((c) => c.url.startsWith(`${API}/investments?`))!.url).toContain(`itemId=${ITEM_ID}`);
    expect(w.fetch.callsTo("GET", `${API}/investments/${investment().id}/transactions`)).toHaveLength(1);
    expect(w.fetch.calls.find((c) => c.url.startsWith(`${API}/identity`))!.url).toContain(`itemId=${ITEM_ID}`);
    expect(await w.core.mirrorCounts()).toEqual({
      transactions: 1,
      bills: 1,
      investments: 1,
      investmentTransactions: 1,
      identities: 1,
    });
  });
});

describe("Sincronização: espelho", () => {
  it("regrava o que mudou e apaga o que sumiu dentro do período lido", async () => {
    const w = await world();
    w.setTxs([tx(1, { date: "2026-10-20T12:00:00.000Z" }), tx(2, { date: "2026-10-13T12:00:00.000Z" }), ...padding(10, 10)]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs([tx(1, { date: "2026-10-20T12:00:00.000Z", description: "MUDOU" }), ...padding(10, 10)]);
    w.newData();

    await w.core.sync({ manual: false });

    const rows = await october(w);
    expect(rows.find((r) => r.id === tid(1))!.description).toBe("MUDOU");
    expect(rows.find((r) => r.id === tid(2))).toBeUndefined();
    expect(rows).toHaveLength(11);
  });

  it("guarda para sempre o que é mais antigo que o período lido", async () => {
    const w = await world();
    w.setTxs([tx(1, { date: "2026-08-10T12:00:00.000Z" }), ...padding(10, 10)]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs(padding(10, 10));
    w.newData();

    await w.core.sync({ manual: false });

    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-08" })).toHaveLength(1);
    expect(await october(w)).toHaveLength(10);
  });

  it("transação apagada e recriada com outro id, e PENDING que vira POSTED, não duplicam", async () => {
    const w = await world();
    w.setTxs([
      tx(1, { status: "PENDING", description: "PENDENTE" }),
      tx(2, { description: "ANTIGA", date: "2026-10-13T12:00:00.000Z" }),
      ...padding(10, 10),
    ]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs([
      tx(1, { status: "POSTED", description: "PENDENTE" }),
      tx(3, { description: "ANTIGA", date: "2026-10-13T12:00:00.000Z" }),
      ...padding(10, 10),
    ]);
    w.newData();

    await w.core.sync({ manual: false });

    const rows = await october(w);
    expect(rows).toHaveLength(12);
    expect(rows.filter((r) => r.description === "ANTIGA").map((r) => r.id)).toEqual([tid(3)]);
    expect(rows.filter((r) => r.description === "PENDENTE")).toHaveLength(1);
  });
});

describe("Sincronização: tudo ou nada", () => {
  it("uma falha na página 3 não grava nada e a data não avança", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs([tx(1, { description: "MUDOU" }), tx(2)], [tx(3)], [tx(4)]);
    w.state.failAtPage = 2;
    w.newData();

    const report = await w.core.sync({ manual: true });

    const rows = await october(w);
    expect(rows.map((r) => r.description)).toEqual(["COMPRA 1"]);
    expect((await w.core.listConnections())[0]).toMatchObject({ dataAt: "2026-11-01T06:00:00.000Z" });
    expect(report.notices).toEqual([{ itemId: ITEM_ID, message: "Não deu para atualizar o MeuPluggy agora" }]);
  });

  it("cada requisição é tentada mais 2 vezes", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    let calls = 0;
    w.fetch.on("GET", `${API}/identity`, () => (++calls < 3 ? { status: 500, body: {} } : { body: page([identity()]) }));

    await w.core.readConnection(ITEM_ID);

    expect(calls).toBe(3);
    expect((await w.core.listConnections())[0]).toMatchObject({ readState: "done" });
  });

  it("desiste depois da 3ª tentativa", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    w.fetch.on("GET", `${API}/identity`, { status: 500, body: {} });

    await w.core.readConnection(ITEM_ID);

    expect(callsStarting(w, `${API}/identity`)).toHaveLength(3);
    expect((await w.core.listConnections())[0]).toMatchObject({ readState: "failed" });
    expect(await october(w)).toEqual([]);
  });

  it("num 429 espera o Retry-After (no máximo 60 s)", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    let calls = 0;
    w.fetch.on("GET", `${API}/identity`, () =>
      ++calls === 1 ? { status: 429, headers: { "Retry-After": "20" }, body: {} } : { body: page([identity()]) },
    );
    const before = w.clock.now();
    await w.core.readConnection(ITEM_ID);
    expect(w.clock.now() - before).toBeGreaterThanOrEqual(20_000);
    expect(w.clock.now() - before).toBeLessThan(MINUTE);

    const w2 = await world();
    w2.setTxs([tx(1)]);
    let calls2 = 0;
    w2.fetch.on("GET", `${API}/identity`, () =>
      ++calls2 === 1 ? { status: 429, headers: { "Retry-After": "600" }, body: {} } : { body: page([identity()]) },
    );
    const before2 = w2.clock.now();
    await w2.core.readConnection(ITEM_ID);
    expect(w2.clock.now() - before2).toBeGreaterThanOrEqual(MINUTE);
    expect(w2.clock.now() - before2).toBeLessThan(MINUTE + 10_000);
  });
});

describe("Sincronização: PARTIAL_SUCCESS e trava", () => {
  it("espelha só os produtos com isUpdated: true; os outros ficam como estavam", async () => {
    const w = await world();
    w.setTxs([tx(1)]);
    w.state.cardTxs = [tx(50, { accountId: CARD })];
    await w.core.readConnection(ITEM_ID);
    // Card transactions vanish, bank ones change, but only `transactions` is updated.
    w.state.cardTxs = [];
    w.setTxs([tx(1, { description: "MUDOU" })]);
    w.newData({
      executionStatus: "PARTIAL_SUCCESS",
      statusDetail: {
        transactions: { isUpdated: true, updatedAt: "2026-11-06T06:00:00.000Z" },
        creditCards: { isUpdated: false, updatedAt: "2026-11-01T06:00:00.000Z" },
      },
    });

    await w.core.sync({ manual: false });

    expect((await october(w))[0]!.description).toBe("MUDOU");
    expect(await w.core.listTransactions({ accountId: CARD, month: "2026-10" })).toHaveLength(1);
    // Each product keeps its own date; the Connection shows the oldest.
    expect((await w.core.listConnections())[0]).toMatchObject({ dataAt: "2026-11-01T06:00:00.000Z" });
  });

  it("a trava: apagar mais de 20% de um produto grava o novo, não apaga nada e não avança a data", async () => {
    const w = await world();
    w.setTxs([tx(1), tx(2), tx(3), tx(4), tx(5)]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs([tx(1, { description: "MUDOU" }), tx(2), tx(3), tx(6, { description: "NOVA" })]); // 4 and 5 vanish: 40%
    w.newData();

    await w.core.sync({ manual: false });

    const rows = await october(w);
    expect(rows.map((r) => r.description).sort()).toEqual(["COMPRA 2", "COMPRA 3", "COMPRA 4", "COMPRA 5", "MUDOU", "NOVA"]);
    expect((await w.core.listConnections())[0]).toMatchObject({ dataAt: "2026-11-01T06:00:00.000Z", lockTriggered: true });
    // Not complete: the next sync tries again.
    const before = accountReads(w);
    await w.core.sync({ manual: false });
    expect(accountReads(w)).toBe(before + 1);
  });

  it("o limite da trava vem da configuração embutida", async () => {
    const w = await world({ mirrorDeleteLimit: 0.6 });
    w.setTxs([tx(1), tx(2), tx(3), tx(4), tx(5)]);
    await w.core.readConnection(ITEM_ID);
    w.setTxs([tx(1), tx(2), tx(3)]); // 40% vanish, under 60%
    w.newData();

    await w.core.sync({ manual: false });

    expect(await october(w)).toHaveLength(3);
  });
});

describe("Sincronização: Conexões independentes e avisos", () => {
  async function two() {
    const w = await world();
    const SECOND = "11111111-0000-0000-0000-000000000002";
    w.fetch.on("GET", `${API}/items/${SECOND}`, () => ({
      body: item({ id: SECOND, connector: { id: 201, name: "BTG" }, lastUpdatedAt: NEWER }),
    }));
    await w.core.finishConnect(SECOND, { tabClosed: NEVER });
    await w.core.readConnection(SECOND);
    return { w, SECOND };
  }

  it("a falha de uma Conexão não trava a outra", async () => {
    const { w, SECOND } = await two();
    w.setTxs([tx(1)]);
    await w.core.readConnection(ITEM_ID);
    w.fetch.on("GET", `${API}/items/${SECOND}`, { status: 500, body: {} });
    w.setTxs([tx(1), tx(2)]);
    w.newData();

    const report = await w.core.sync({ manual: true });

    expect(await october(w)).toHaveLength(2);
    expect(report.notices).toEqual([{ itemId: SECOND, message: "Não deu para atualizar o BTG agora" }]);
  });

  it("ao só abrir o app nenhum aviso aparece", async () => {
    const { w, SECOND } = await two();
    w.fetch.on("GET", `${API}/items/${SECOND}`, { status: 500, body: {} });

    const report = await w.core.sync({ manual: false });

    expect(report.notices).toEqual([]);
  });
});
