import { describe, expect, it } from "vitest";
import {
  account,
  authError,
  authResponse,
  identity,
  item,
  page,
  SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENT_SECRET,
  transaction,
} from "../testing/pluggyResponses";
import { createTestWorld, HOUR } from "../testing/world";

const API = "https://api.pluggy.ai";
const ITEM_ID = "11111111-0000-0000-0000-000000000001";
const BANK = "22222222-0000-0000-0000-000000000001";
const NEVER = new Promise<void>(() => {});
const DAY = 24 * HOUR;
const FRESH = "2026-11-09T06:00:00.000Z";

/** One Connection ("BTG") already read at the clock's start (2026-11-09 12:00Z), data dated 06:00. */
async function world(startAt = "2026-11-09T12:00:00.000Z", dataAt = FRESH) {
  const w = await createTestWorld({ startAt });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const state = { item: item({ connector: { id: 200, name: "BTG" }, lastUpdatedAt: dataAt }) as Record<string, unknown> | null, txFails: false };
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => (state.item === null ? { status: 404, body: {} } : { body: state.item }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account({ name: "BTG" })]) });
  w.fetch.on("GET", `${API}/v2/transactions`, () =>
    state.txFails ? { status: 500, body: {} } : { body: { results: [transaction({ date: "2026-11-05T12:00:00.000Z" })], next: null } },
  );
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  await w.core.readConnection(ITEM_ID);
  const conn = async () => (await w.core.listConnections())[0]!;
  const setItem = (overrides: Record<string, unknown>) => (state.item = item({ connector: { id: 200, name: "BTG" }, ...overrides } as never));
  const accountReads = () => w.fetch.calls.filter((c) => c.method === "GET" && c.url.startsWith(`${API}/accounts`)).length;
  return { ...w, state, conn, setItem, accountReads };
}

describe("Estados: atrasada", () => {
  it("conta as 48 h da data dos dados, não da última leitura", async () => {
    const w = await world();
    expect(await w.conn()).toMatchObject({ state: "ok", status: null });

    w.clock.advance(41 * HOUR); // 47 h depois dos dados (06:00 do dia 9)
    await w.core.sync({ manual: true }); // o Pluggy não tem nada novo: o app confere mas os dados seguem velhos
    expect((await w.conn()).state).toBe("ok");

    w.clock.advance(2 * HOUR); // 49 h
    await w.core.sync({ manual: true });
    expect(await w.conn()).toMatchObject({ state: "late", status: { kind: "late", headline: "Sem dados novos desde 09/11" } });
  });

  it("OUTDATED vira atrasada com 'Abrir o Meu Pluggy' e Reconectar como opção secundária", async () => {
    const w = await world();
    w.clock.advance(3 * DAY);
    w.setItem({ status: "OUTDATED", lastUpdatedAt: FRESH });
    await w.core.sync({ manual: true });
    expect((await w.conn()).status).toMatchObject({
      kind: "late",
      headline: "Sem dados novos desde 09/11",
      cause: "O Meu Pluggy não atualiza o BTG",
      primaryAction: "open-meu-pluggy",
      secondaryAction: "reconnect",
    });
  });

  it("PARTIAL_SUCCESS que deixa um produto parado nomeia o produto", async () => {
    const w = await world("2026-11-03T12:00:00.000Z", "2026-11-03T06:00:00.000Z");
    w.clock.advance(5 * DAY);
    w.setItem({
      executionStatus: "PARTIAL_SUCCESS",
      lastUpdatedAt: "2026-11-08T06:00:00.000Z",
      statusDetail: {
        accounts: { isUpdated: true, updatedAt: "2026-11-08T06:00:00.000Z" },
        transactions: { isUpdated: true, updatedAt: "2026-11-08T06:00:00.000Z" },
        creditCards: { isUpdated: true, updatedAt: "2026-11-08T06:00:00.000Z" },
        investments: { isUpdated: false },
        investmentsTransactions: { isUpdated: false },
        identity: { isUpdated: true, updatedAt: "2026-11-08T06:00:00.000Z" },
      },
    });
    await w.core.sync({ manual: true });
    expect((await w.conn()).status).toMatchObject({
      kind: "late",
      headline: "Investimentos do BTG sem dados novos desde 03/11",
      primaryAction: "open-meu-pluggy",
    });
  });

  it("código desconhecido do Pluggy cai em atrasada, depois das 48 h", async () => {
    const w = await world();
    w.clock.advance(1 * DAY);
    w.setItem({ status: "STATUS_NOVO", executionStatus: "CODIGO_NOVO", lastUpdatedAt: "2026-11-10T08:00:00.000Z" });
    await w.core.sync({ manual: true });
    expect((await w.conn()).state).toBe("ok");
    w.clock.advance(2 * DAY);
    w.setItem({ status: "STATUS_NOVO", executionStatus: "CODIGO_NOVO", lastUpdatedAt: "2026-11-12T08:00:00.000Z" });
    await w.core.sync({ manual: true });
    expect(await w.conn()).toMatchObject({ state: "late", status: { primaryAction: null, secondaryAction: "reconnect" } });
  });

  it("leitura local que segue falhando fica atrasada e pede o diagnóstico", async () => {
    const w = await world();
    w.clock.advance(30 * HOUR);
    w.setItem({ lastUpdatedAt: "2026-11-10T06:00:00.000Z" });
    w.state.txFails = true;
    await w.core.sync({ manual: true });
    w.clock.advance(20 * HOUR);
    await w.core.sync({ manual: true });
    expect(await w.conn()).toMatchObject({
      state: "late",
      status: { cause: "O app não consegue ler o BTG", primaryAction: null, secondaryAction: "reconnect" },
    });
  });

  it("segue sincronizando e volta a 'em dia' quando chega dado novo", async () => {
    const w = await world();
    w.clock.advance(3 * DAY);
    w.setItem({ status: "OUTDATED", lastUpdatedAt: FRESH });
    await w.core.sync({ manual: true });
    const reads = w.accountReads();
    w.setItem({ lastUpdatedAt: "2026-11-12T06:00:00.000Z" });
    await w.core.sync({ manual: true });
    expect(w.accountReads()).toBeGreaterThan(reads);
    expect((await w.conn()).state).toBe("ok");
  });
});

describe("Estados: a reconectar", () => {
  it("LOGIN_ERROR para de sincronizar, mantém os dados e pede 'Reconectar' na hora", async () => {
    const w = await world();
    w.setItem({ status: "LOGIN_ERROR" });
    await w.core.sync({ manual: true });
    expect(await w.conn()).toMatchObject({
      state: "reconnect",
      status: { kind: "reconnect", primaryAction: "reconnect", secondaryAction: null, headline: "Sem dados novos desde 09/11" },
    });
    const reads = w.accountReads();
    w.setItem({});
    await w.core.sync({ manual: true });
    expect(w.accountReads()).toBe(reads);
    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-11" })).toHaveLength(1);
  });

  it("o item que dá 404 pede reconectar", async () => {
    const w = await world();
    w.state.item = null;
    await w.core.sync({ manual: true });
    expect(await w.conn()).toMatchObject({ state: "reconnect", status: { primaryAction: "reconnect" } });
  });

  it("a Conexão vencida pede reconectar e diz que venceu", async () => {
    const w = await world();
    w.clock.advance(70 * DAY);
    expect(await w.conn()).toMatchObject({ state: "reconnect", status: { cause: "A conexão venceu", primaryAction: "reconnect" } });
  });
});

describe("Transações: 'Dados de' da conta parada", () => {
  it("a conta de uma Conexão parada traz a data; a de uma em dia não", async () => {
    const w = await world();
    expect((await w.core.listAccounts())[0]!.dataFrom).toBeNull();
    w.setItem({ status: "LOGIN_ERROR" });
    await w.core.sync({ manual: true });
    expect((await w.core.listAccounts())[0]!.dataFrom).toBe("09/11");
  });
});

describe("Credenciais recusadas", () => {
  async function refused() {
    const w = await world();
    w.clock.advance(3 * HOUR); // a apiKey expira
    w.fetch.on("POST", `${API}/auth`, authError(401));
    w.setItem({ lastUpdatedAt: "2026-11-09T09:00:00.000Z" });
    await w.core.sync({ manual: true });
    return w;
  }

  it("um 401 do /auth para tudo e para o relógio das 48 h", async () => {
    const w = await refused();
    expect(await w.core.credentialsRefused()).toBe(true);
    w.clock.advance(5 * DAY);
    const reads = w.accountReads();
    await w.core.sync({ manual: true });
    expect(w.accountReads()).toBe(reads);
    expect((await w.conn()).state).toBe("ok");
  });

  it("atualizar o Client Secret confere antes de salvar e volta a sincronizar", async () => {
    const w = await refused();
    expect(await w.core.updateClientSecret("outro-secret")).toMatchObject({ ok: false, error: { kind: "refused" } });
    expect(await w.core.credentialsRefused()).toBe(true);
    expect(w.secret.value).toBe(SYNTHETIC_CLIENT_SECRET);

    w.fetch.on("POST", `${API}/auth`, { body: authResponse("nova") });
    expect(await w.core.updateClientSecret("secret-novo")).toEqual({ ok: true });
    expect(w.secret.value).toBe("secret-novo");
    expect(await w.core.credentialsRefused()).toBe(false);
    expect(w.fetch.callsTo("POST", `${API}/auth`).at(-1)!.body).toEqual({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: "secret-novo" });
    w.setItem({ lastUpdatedAt: "2026-11-12T06:00:00.000Z" });
    const reads = w.accountReads();
    await w.core.sync({ manual: true });
    expect(w.accountReads()).toBeGreaterThan(reads);
  });
});

describe("Aviso do Resumo", () => {
  it("sem nada a avisar, não há aviso", async () => {
    const w = await world();
    await w.core.recordBackup();
    expect(await w.core.notices()).toEqual({ shown: null, more: 0 });
  });

  it("a reconectar mostra o texto e a ação", async () => {
    const w = await world();
    w.clock.advance(70 * DAY); // vencida
    await w.core.recordBackup();
    const queue = await w.core.notices();
    expect(queue.shown).toMatchObject({ kind: "reconnect", text: "A conexão com o BTG precisa de um novo login · Reconectar" });
    expect(queue.more).toBe(0);
  });

  it("credenciais recusadas vêm antes de tudo, e 'e mais N' conta os outros", async () => {
    const w = await world();
    await w.core.recordBackup();
    w.setItem({ status: "LOGIN_ERROR" });
    await w.core.sync({ manual: true });
    w.clock.advance(3 * HOUR);
    w.fetch.on("POST", `${API}/auth`, authError(401));
    await w.core.pluggyRequest("GET", "/items").catch(() => undefined);
    const queue = await w.core.notices();
    expect(queue.shown).toMatchObject({ kind: "credentials", text: "O Pluggy recusou suas credenciais · Atualizar Client Secret", snoozable: false });
    expect(queue.more).toBe(1);
  });

  it("ordem: a reconectar, atrasada, vencimento", async () => {
    const w = await world();
    w.clock.advance(3 * DAY);
    w.setItem({ status: "OUTDATED", lastUpdatedAt: FRESH });
    await w.core.sync({ manual: true });
    expect((await w.core.notices()).shown).toMatchObject({ kind: "late", text: "BTG sem dados novos desde 09/11 · Ver" });

    w.clock.advance(70 * DAY);
    expect((await w.core.notices()).shown!.kind).toBe("reconnect");
  });

  it("vencimento entra quando faltam até 30 dias", async () => {
    const w = await world();
    w.clock.advance(40 * DAY);
    w.setItem({ lastUpdatedAt: "2026-12-19T06:00:00.000Z" });
    await w.core.sync({ manual: true });
    expect((await w.core.notices()).shown).toMatchObject({ kind: "expiring", text: "A conexão com o BTG vence em 22 dias · Renovar" });
  });

  it("'Agora não' adia por 30 dias, e o aviso volta depois", async () => {
    const w = await world();
    w.clock.advance(70 * DAY);
    await w.core.snoozeNotice("backup");
    const { shown } = await w.core.notices();
    await w.core.snoozeNotice(shown!.key);
    expect(await w.core.notices()).toEqual({ shown: null, more: 0 });
    w.clock.advance(29 * DAY);
    await w.core.recordBackup();
    expect((await w.core.notices()).shown).toBeNull();
    w.clock.advance(2 * DAY);
    await w.core.recordBackup();
    expect((await w.core.notices()).shown!.kind).toBe("reconnect");
  });

  it("as credenciais recusadas não se adiam", async () => {
    const w = await world();
    w.clock.advance(3 * HOUR);
    w.fetch.on("POST", `${API}/auth`, authError(401));
    await w.core.sync({ manual: true });
    const { shown } = await w.core.notices();
    await w.core.snoozeNotice(shown!.key);
    expect((await w.core.notices()).shown!.kind).toBe("credentials");
  });
});

describe("Diagnóstico", () => {
  it("traz o estado de cada Conexão no app", async () => {
    const w = await world();
    w.setItem({ status: "LOGIN_ERROR" });
    await w.core.sync({ manual: true });
    expect(await w.core.diagnostic()).toContain("estado no app: a reconectar · causa login-error");
  });
});
