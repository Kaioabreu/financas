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
const OLD_ITEM = "11111111-0000-0000-0000-000000000001";
const NEW_ITEM = "11111111-0000-0000-0000-000000000002";
const BANK = "22222222-0000-0000-0000-000000000001";
const OTHER_BANK = "22222222-0000-0000-0000-000000000009";
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const DAY = 86_400_000;

/** One Connection already read (one account, a card, one transaction), plus a rule and a hand edit. */
async function world() {
  const w = await createTestWorld({ startAt: "2026-11-09T12:00:00.000Z" });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const state = { accounts: [account(), creditCard()] as object[], items: new Map<string, object>() };
  state.items.set(OLD_ITEM, item());
  state.items.set(NEW_ITEM, item({ id: NEW_ITEM, consentExpiresAt: "2027-11-09T12:00:00.000Z" }));
  for (const id of [OLD_ITEM, NEW_ITEM]) {
    w.fetch.on("GET", `${API}/items/${id}`, () => ({ body: state.items.get(id) }));
    w.fetch.on("DELETE", `${API}/items/${id}`, { body: {} });
  }
  w.fetch.on("GET", `${API}/accounts`, (call) => ({
    body: page(state.accounts.filter((a: any) => call.url.includes(`itemId=${a.itemId}`))),
  }));
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => ({
    body: { results: call.url.includes(`accountId=${BANK}`) ? [transaction({ description: "COMPRA SINTETICA" })] : [], next: null },
  }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(OLD_ITEM, { tabClosed: NEVER });
  await w.core.readConnection(OLD_ITEM);
  return { ...w, state };
}
const itemsIn = async (w: Awaited<ReturnType<typeof world>>) => (await w.core.listConnections()).map((c) => c.itemId);

describe("Renovação: o banco é reconhecido pelos ids das contas", () => {
  it("ids iguais trocam o item da Conexão, apagam o velho e mantêm os dados", async () => {
    const w = await world();
    w.state.accounts = [account({ itemId: NEW_ITEM }), creditCard({ itemId: NEW_ITEM })];

    const result = await w.core.finishConnect(NEW_ITEM, { tabClosed: NEVER });

    expect(result).toEqual({ ok: true, renewed: true });
    expect(await itemsIn(w)).toEqual([NEW_ITEM]);
    expect(w.fetch.callsTo("DELETE", `${API}/items/${OLD_ITEM}`)).toHaveLength(1);
    expect(w.fetch.callsTo("DELETE", `${API}/items/${NEW_ITEM}`)).toHaveLength(0);
    expect((await w.core.listAccounts()).every((a) => a.itemId === NEW_ITEM)).toBe(true);
    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(1);
    const [conn] = await w.core.listConnections();
    expect(conn!.consentExpiresAt).toBe("2027-11-09T12:00:00.000Z");
  });

  it("o banco errado na renovação vira uma Conexão nova e não mexe na antiga", async () => {
    const w = await world();
    w.state.accounts = [account({ id: OTHER_BANK, itemId: NEW_ITEM, name: "Outro Banco" })];

    const result = await w.core.finishConnect(NEW_ITEM, { tabClosed: NEVER });

    expect(result).toEqual({ ok: true });
    expect((await itemsIn(w)).sort()).toEqual([OLD_ITEM, NEW_ITEM]);
    expect(w.fetch.callsTo("DELETE", `${API}/items/${OLD_ITEM}`)).toHaveLength(0);
    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(1);
  });
});

describe("Vencimento", () => {
  it("a 30 dias do consentExpiresAt a Conexão mostra 'vence em N dias'", async () => {
    const w = await world();
    w.state.items.set(OLD_ITEM, item());
    // consent expires 2027-01-10T12:00; today is 2026-11-09T12:00 -> 62 days
    expect((await w.core.listConnections())[0]).toMatchObject({ state: "ok", daysLeft: 62 });
    w.clock.advance(40 * DAY);
    expect((await w.core.listConnections())[0]).toMatchObject({ state: "expiring", daysLeft: 22 });
  });

  it("vencida, a Conexão não sincroniza e mantém os dados, mesmo se o Pluggy responder vazio", async () => {
    const w = await world();
    w.clock.advance(70 * DAY);
    w.state.items.set(OLD_ITEM, item({ lastUpdatedAt: "2027-01-20T06:00:00.000Z" }));
    w.fetch.on("GET", `${API}/v2/transactions`, { body: { results: [], next: null } });
    const before = w.fetch.calls.length;

    await w.core.sync({ manual: true });
    await w.core.readConnection(OLD_ITEM);

    expect((await w.core.listConnections())[0]).toMatchObject({ state: "expired" });
    expect(w.fetch.calls.slice(before).filter((c) => c.url.includes("/accounts") || c.url.includes("/transactions"))).toHaveLength(0);
    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(1);
  });
});

describe("Remover uma Conexão", () => {
  it("apaga o item no Pluggy e os dados locais do banco, e mantém as regras", async () => {
    const w = await world();
    expect(await w.core.addRule({ contains: "sintetica", nature: "expense", category: "food" })).toEqual({ ok: true });

    await w.core.removeConnection(OLD_ITEM);

    expect(w.fetch.callsTo("DELETE", `${API}/items/${OLD_ITEM}`)).toHaveLength(1);
    expect(await w.core.listConnections()).toEqual([]);
    expect(await w.core.listAccounts()).toEqual([]);
    expect(await w.core.mirrorCounts()).toEqual({ transactions: 0, bills: 0, investments: 0, investmentTransactions: 0, identities: 0 });
    expect((await w.core.listRules()).user).toHaveLength(1);
  });

  it("não apaga os dados de outro banco", async () => {
    const w = await world();
    w.state.accounts = [account({ id: OTHER_BANK, itemId: NEW_ITEM, name: "Outro Banco" })];
    await w.core.finishConnect(NEW_ITEM, { tabClosed: NEVER });

    await w.core.removeConnection(NEW_ITEM);

    expect(await itemsIn(w)).toEqual([OLD_ITEM]);
    expect(await w.core.listTransactions({ accountId: BANK, month: "2026-10" })).toHaveLength(1);
  });
});
