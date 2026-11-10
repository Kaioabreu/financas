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
const ITEM = "11111111-0000-0000-0000-000000000001";
const BANK = "22222222-0000-0000-0000-000000000001";
const NEVER = new Promise<void>(() => {});

async function world() {
  const w = await createTestWorld({ startAt: "2026-11-09T12:00:00.000Z" });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM}`, { body: item({ lastUpdatedAt: "2026-11-09T06:00:00.000Z" }) });
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, {
    body: { results: [transaction({ description: "COMPRA SINTETICA" })], next: null },
  });
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM, { tabClosed: NEVER });
  await w.core.readConnection(ITEM);
  return w;
}

describe("Trocar de aplicação", () => {
  it("apaga as Conexões e os dados baixados, e deixa as credenciais em branco", async () => {
    const w = await world();

    await w.core.switchApplication();

    expect(await w.core.listConnections()).toEqual([]);
    expect(await w.core.listAccounts()).toEqual([]);
    expect(await w.core.mirrorCounts()).toEqual({ transactions: 0, bills: 0, investments: 0, investmentTransactions: 0, identities: 0 });
    expect(await w.core.credentialsStatus()).toEqual({ saved: false });
    expect(w.secret.value).toBeNull();
  });

  it("mantém as regras e as edições à mão", async () => {
    const w = await world();
    await w.core.addRule({ contains: "sintetica", nature: "expense", category: "food" });
    const [tx] = await w.core.listTransactions({ accountId: BANK, month: "2026-10" });
    await w.core.editTransaction(tx!.id, { nature: "expense", category: "leisure" });

    await w.core.switchApplication();

    expect((await w.core.listRules()).user).toHaveLength(1);
    // The edit survives: reading the same transaction again with a new application keeps it.
    w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
    await w.core.saveCredentials({ clientId: "outra-aplicacao", clientSecret: "outro-secret" });
    await w.core.finishConnect(ITEM, { tabClosed: NEVER });
    await w.core.readConnection(ITEM);
    const [again] = await w.core.listTransactions({ accountId: BANK, month: "2026-10" });
    expect(again).toMatchObject({ nature: "expense", category: "leisure" });
  });

  it("deixa o app pronto para novas credenciais (sem aviso de recusa)", async () => {
    const w = await world();
    await w.core.switchApplication();
    expect(await w.core.credentialsRefused()).toBe(false);
    expect(await w.core.saveCredentials({ clientId: "novo", clientSecret: "novo-secret" })).toEqual({ ok: true });
    expect(await w.core.credentialsStatus()).toEqual({ saved: true, clientId: "novo" });
  });
});

describe("Aparência", () => {
  it("o padrão é 'Do sistema'", async () => {
    const w = await createTestWorld();
    expect(await w.core.appearance()).toBe("system");
  });

  it("Claro e Escuro ficam guardados no banco e sobrevivem a reiniciar o app", async () => {
    const w = await createTestWorld();
    await w.core.setAppearance("dark");
    expect(await w.restart().appearance()).toBe("dark");
    await w.core.setAppearance("light");
    expect(await w.restart().appearance()).toBe("light");
    await w.core.setAppearance("system");
    expect(await w.restart().appearance()).toBe("system");
  });
});

describe("Apagar tudo", () => {
  const SECOND = "11111111-0000-0000-0000-000000000002";

  async function twoBanks() {
    const w = await world();
    w.fetch.on("GET", `${API}/items/${SECOND}`, { body: item({ id: SECOND, lastUpdatedAt: "2026-11-09T06:00:00.000Z" }) });
    w.fetch.on("GET", `${API}/accounts`, {
      body: page([account({ id: "22222222-0000-0000-0000-000000000009" })]),
    });
    await w.core.finishConnect(SECOND, { tabClosed: NEVER });
    expect(await w.core.listConnections()).toHaveLength(2);
    return w;
  }

  it("tenta DELETE /items/{id} em cada Conexão", async () => {
    const w = await twoBanks();
    w.fetch.on("DELETE", `${API}/items/${ITEM}`, { status: 204 });
    w.fetch.on("DELETE", `${API}/items/${SECOND}`, { status: 204 });

    expect(await w.core.eraseAtPluggy()).toEqual({ failed: 0 });

    expect(w.fetch.callsTo("DELETE", `${API}/items/${ITEM}`)).toHaveLength(1);
    expect(w.fetch.callsTo("DELETE", `${API}/items/${SECOND}`)).toHaveLength(1);
  });

  it("segue para as outras Conexões quando um DELETE falha, e conta a falha", async () => {
    const w = await twoBanks();
    w.fetch.on("DELETE", `${API}/items/${ITEM}`, { status: 500 });
    w.fetch.on("DELETE", `${API}/items/${SECOND}`, { status: 204 });

    expect(await w.core.eraseAtPluggy()).toEqual({ failed: 1 });
    expect(w.fetch.callsTo("DELETE", `${API}/items/${SECOND}`)).toHaveLength(1);
  });

  it("conta tudo como falha quando está sem internet", async () => {
    const w = await twoBanks();
    w.fetch.goOffline();
    expect(await w.core.eraseAtPluggy()).toEqual({ failed: 2 });
  });

  it("trata item que já não existe (404) como apagado", async () => {
    const w = await twoBanks();
    w.fetch.on("DELETE", `${API}/items/${ITEM}`, { status: 404 });
    w.fetch.on("DELETE", `${API}/items/${SECOND}`, { status: 404 });
    expect(await w.core.eraseAtPluggy()).toEqual({ failed: 0 });
  });

  it("sem Conexões, não chama a Pluggy", async () => {
    const w = await createTestWorld();
    expect(await w.core.eraseAtPluggy()).toEqual({ failed: 0 });
    expect(w.fetch.calls).toHaveLength(0);
  });
});
