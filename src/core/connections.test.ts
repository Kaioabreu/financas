import { describe, expect, it } from "vitest";
import {
  account,
  authResponse,
  creditCard,
  item,
  page,
  SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENT_SECRET,
  transaction,
} from "../testing/pluggyResponses";
import { createTestWorld, type FakeFetch } from "../testing/world";

const API = "https://api.pluggy.ai";
const ITEM_ID = "11111111-0000-0000-0000-000000000001";
const OAUTH_URL = "https://meu.pluggy.ai/oauth/authorize?synthetic=1";
const NEVER = new Promise<void>(() => {});
const MINUTE = 60_000;

const waitingItem = () =>
  ({ ...item({ status: "WAITING_USER_ACTION", executionStatus: "PENDING" }), parameter: { data: OAUTH_URL } });

async function worldWithCredentials() {
  const world = await createTestWorld();
  world.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await world.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  return world;
}

/** GET /items/{id} answers each status in turn, repeating the last one. */
function itemSequence(fetch: FakeFetch, ...statuses: object[]) {
  let i = 0;
  fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: statuses[Math.min(i++, statuses.length - 1)] }));
}

describe("Conectar um banco: começo", () => {
  it("cria o item no conector 200, sem avoidDuplicates, e espera a URL de OAuth aparecer", async () => {
    const { core, fetch } = await worldWithCredentials();
    fetch.on("POST", `${API}/items`, { status: 201, body: item({ status: "UPDATING", executionStatus: "CREATING" }) });
    itemSequence(fetch, item({ status: "UPDATING", executionStatus: "CREATING" }), waitingItem());

    const result = await core.startConnect();

    expect(result).toEqual({ ok: true, itemId: ITEM_ID, authUrl: OAUTH_URL });
    const body = fetch.callsTo("POST", `${API}/items`)[0]!.body as Record<string, unknown>;
    expect(body.connectorId).toBe(200);
    expect(body).not.toHaveProperty("avoidDuplicates");
    expect(fetch.callsTo("GET", `${API}/items/${ITEM_ID}`)).toHaveLength(2);
  });

  it("um banco recusado pelo Meu Pluggy (limite de 5) vira erro da entrada", async () => {
    const { core, fetch } = await worldWithCredentials();
    fetch.on("POST", `${API}/items`, { status: 403, body: { message: "Too many items" } });

    const result = await core.startConnect();

    expect(result).toMatchObject({ ok: false, error: { kind: "limit" } });
    if (!result.ok) expect(result.error.helpUrl).toContain("#limite-de-5-bancos");
  });

  it("conta só de sandbox ou conector não habilitado tem erro próprio, com o link do guia", async () => {
    for (const message of ["Contas de teste só podem conectar conectores sandbox", "Connector not enabled for this application"]) {
      const { core, fetch } = await worldWithCredentials();
      fetch.on("POST", `${API}/items`, { status: 403, body: { message } });

      const result = await core.startConnect();

      expect(result).toMatchObject({ ok: false, error: { kind: "connector" } });
      if (!result.ok) expect(result.error.helpUrl).toContain("#conector-nao-habilitado-ou-conta-so-de-sandbox");
    }
  });

  it("recusa sem mensagem reconhecível continua sendo o limite de 5", async () => {
    const { core, fetch } = await worldWithCredentials();
    fetch.on("POST", `${API}/items`, { status: 400, body: {} });
    expect(await core.startConnect()).toMatchObject({ ok: false, error: { kind: "limit" } });
  });

  it("sem internet vira 'sem internet'", async () => {
    const { core, fetch } = await worldWithCredentials();
    fetch.goOffline();
    expect(await core.startConnect()).toMatchObject({ ok: false, error: { kind: "offline" } });
  });
});

describe("Conectar um banco: esperar a autorização", () => {
  async function started() {
    const world = await worldWithCredentials();
    world.fetch.on("DELETE", `${API}/items/${ITEM_ID}`, { body: {} });
    return world;
  }

  it("consulta o item até UPDATED e cria a Conexão em 'Lendo…'", async () => {
    const { core, fetch } = await started();
    itemSequence(fetch, waitingItem(), item({ status: "UPDATING" }), item({ status: "UPDATED" }));

    const result = await core.finishConnect(ITEM_ID, { tabClosed: NEVER });

    expect(result).toEqual({ ok: true });
    expect(fetch.callsTo("DELETE", `${API}/items/${ITEM_ID}`)).toHaveLength(0);
    expect(await core.listConnections()).toMatchObject([{ itemId: ITEM_ID, bankName: "Conta 1", readState: "reading" }]);
  });

  it("item OUTDATED é apagado, e nenhuma Conexão é criada", async () => {
    const { core, fetch } = await started();
    itemSequence(fetch, waitingItem(), item({ status: "OUTDATED" }));

    const result = await core.finishConnect(ITEM_ID, { tabClosed: NEVER });

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(fetch.callsTo("DELETE", `${API}/items/${ITEM_ID}`)).toHaveLength(1);
    expect(await core.listConnections()).toEqual([]);
  });

  it("depois de 4 minutos sem autorização o item é apagado", async () => {
    const { core, fetch, clock } = await started();
    itemSequence(fetch, waitingItem());
    const before = clock.now();

    const result = await core.finishConnect(ITEM_ID, { tabClosed: NEVER });

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(clock.now() - before).toBeGreaterThanOrEqual(4 * MINUTE);
    expect(fetch.callsTo("DELETE", `${API}/items/${ITEM_ID}`)).toHaveLength(1);
  });

  it("a aba fechada sem autorizar apaga o item", async () => {
    const { core, fetch } = await started();
    itemSequence(fetch, waitingItem());

    const result = await core.finishConnect(ITEM_ID, { tabClosed: Promise.resolve() });

    expect(result).toEqual({ ok: false, reason: "closed" });
    expect(fetch.callsTo("DELETE", `${API}/items/${ITEM_ID}`)).toHaveLength(1);
    expect(await core.listConnections()).toEqual([]);
  });

  it("a aba fechada depois de autorizar não apaga nada: o item segue até UPDATED", async () => {
    const { core, fetch } = await started();
    itemSequence(fetch, item({ status: "UPDATING" }), item({ status: "UPDATED" }));

    const result = await core.finishConnect(ITEM_ID, { tabClosed: Promise.resolve() });

    expect(result).toEqual({ ok: true });
    expect(fetch.callsTo("DELETE", `${API}/items/${ITEM_ID}`)).toHaveLength(0);
  });
});

describe("Primeira leitura", () => {
  const BANK = "22222222-0000-0000-0000-000000000001";
  const CARD = "22222222-0000-0000-0000-000000000002";

  async function connected() {
    const world = await worldWithCredentials();
    itemSequence(world.fetch, item({ status: "UPDATED" }));
    await world.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
    world.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
    world.fetch.on("GET", `${API}/bills`, { body: page([]) });
    world.fetch.on("GET", `${API}/investments`, { body: page([]) });
    world.fetch.on("GET", `${API}/identity`, { body: page([]) });
    return world;
  }
  const txRoute = (fetch: FakeFetch, accountId: string, pages: object[][]) =>
    fetch.on("GET", `${API}/v2/transactions`, (call) => {
      if (!call.url.includes(`accountId=${accountId}`)) return { body: { results: [], next: null } };
      const after = /after=(\d+)/.exec(call.url);
      const index = after ? Number(after[1]) : 0;
      const next = index + 1 < pages.length ? `?accountId=${accountId}&after=${index + 1}` : null;
      return { body: { results: pages[index], next } };
    });

  it("grava contas e cartões, e a Conexão sai de 'Lendo…'", async () => {
    const { core, fetch } = await connected();
    txRoute(fetch, BANK, [[]]);

    await core.readConnection(ITEM_ID);

    expect(fetch.calls.find((c) => c.url.startsWith(`${API}/accounts`))!.url).toContain(`itemId=${ITEM_ID}`);
    expect(await core.listAccounts()).toEqual([
      expect.objectContaining({ id: BANK, name: "Conta Sintética", kind: "account" }),
      expect.objectContaining({ id: CARD, name: "Cartão Sintético", kind: "card" }),
    ]);
    expect(await core.listConnections()).toMatchObject([{ readState: "done" }]);
  });

  it("segue o cursor 'next' até o fim, sem perder nenhuma transação", async () => {
    const { core, fetch } = await connected();
    const tx = (n: number) => transaction({ id: `44444444-0000-0000-0000-00000000000${n}`, description: `COMPRA ${n}` });
    txRoute(fetch, BANK, [[tx(1), tx(2)], [tx(3)], [tx(4)]]);

    await core.readConnection(ITEM_ID);

    const rows = await core.listTransactions({ accountId: BANK, month: "2026-10" });
    expect(rows.map((r) => r.description).sort()).toEqual(["COMPRA 1", "COMPRA 2", "COMPRA 3", "COMPRA 4"]);
  });

  it("mostra o valor em moeda da conta quando vem preenchido, senão o amount", async () => {
    const { core, fetch } = await connected();
    txRoute(fetch, CARD, [
      [
        transaction({
          id: "44444444-0000-0000-0000-000000000001",
          accountId: CARD,
          description: "DOLAR",
          amount: -10,
          amountInAccountCurrency: -52.3,
          currencyCode: "USD",
        }),
        transaction({
          id: "44444444-0000-0000-0000-000000000002",
          accountId: CARD,
          description: "REAL",
          amount: -42.5,
          amountInAccountCurrency: null,
        }),
      ],
    ]);

    await core.readConnection(ITEM_ID);

    const rows = await core.listTransactions({ accountId: CARD, month: "2026-10" });
    expect(Object.fromEntries(rows.map((r) => [r.description, r.amount]))).toEqual({ DOLAR: -52.3, REAL: -42.5 });
  });

  it("lista só o mês pedido, e só a conta pedida, com descrição e data", async () => {
    const { core, fetch } = await connected();
    txRoute(fetch, BANK, [
      [
        transaction({ id: "44444444-0000-0000-0000-000000000001", date: "2026-10-20T12:00:00.000Z", description: "OUTUBRO" }),
        transaction({ id: "44444444-0000-0000-0000-000000000002", date: "2026-09-30T12:00:00.000Z", description: "SETEMBRO" }),
      ],
    ]);
    await core.readConnection(ITEM_ID);

    expect(await core.listTransactions({ accountId: BANK, month: "2026-10" })).toMatchObject([
      { id: "44444444-0000-0000-0000-000000000001", description: "OUTUBRO", date: "2026-10-20", amount: -42.5 },
    ]);
    expect(await core.listTransactions({ accountId: CARD, month: "2026-10" })).toEqual([]);
  });

  it("ler de novo não duplica transações (gravadas pelo id do Pluggy)", async () => {
    const { core, fetch } = await connected();
    txRoute(fetch, BANK, [[transaction()]]);
    await core.readConnection(ITEM_ID);
    await core.readConnection(ITEM_ID);
    expect(await core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(1);
  });

  it("uma leitura que falha no meio não grava nada e marca a falha", async () => {
    const { core, fetch } = await connected();
    let calls = 0;
    fetch.on("GET", `${API}/v2/transactions`, (call) => {
      if (!call.url.includes(`accountId=${BANK}`)) return { body: { results: [], next: null } };
      return ++calls === 1
        ? { body: { results: [transaction()], next: `?accountId=${BANK}&after=1` } }
        : { status: 500, body: {} };
    });

    await core.readConnection(ITEM_ID);

    expect(await core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(0);
    expect(await core.listConnections()).toMatchObject([{ readState: "failed" }]);
  });

  it("accountIds com duas contas mostra as duas; vazio = todas", async () => {
    const { core, fetch } = await connected();
    const bank = transaction({ id: "44444444-0000-0000-0000-000000000001", description: "NO BANCO", accountId: BANK });
    const card = transaction({ id: "44444444-0000-0000-0000-000000000002", description: "NO CARTAO", accountId: CARD });
    fetch.on("GET", `${API}/v2/transactions`, (call) => ({
      body: { results: call.url.includes(`accountId=${CARD}`) ? [card] : [bank], next: null },
    }));
    await core.readConnection(ITEM_ID);
    const names = async (accountIds?: string[]) => (await core.listTransactions({ month: "2026-10", accountIds })).map((r) => r.description).sort();
    expect(await names([BANK, CARD])).toEqual(["NO BANCO", "NO CARTAO"]);
    expect(await names([CARD])).toEqual(["NO CARTAO"]);
    expect(await names([])).toEqual(["NO BANCO", "NO CARTAO"]);
  });
});
