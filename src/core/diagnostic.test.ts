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
const NEVER = new Promise<void>(() => {});
const tx = (n: number) =>
  transaction({ id: `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`, description: `PADARIA DO ZE ${n}`, amount: -4242.42 });

// Everything that must never reach the text.
const SENSITIVE = [
  "PADARIA DO ZE",
  "4242",
  "Fulana de Tal Sintética",
  "12345678901",
  SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENT_SECRET,
  ITEM_ID,
  BANK,
  "MENSAGEM DO BANCO SENSIVEL",
  "PROVIDER MESSAGE SENSIVEL",
  "synthetic-api-key",
];

async function world() {
  const w = await createTestWorld({ env: { appVersion: "1.2.3", otaId: "ota-abc" } });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const state = { item: item() as Record<string, unknown>, txs: [tx(1), tx(2), tx(3), tx(4), tx(5)] as object[] };
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: state.item }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, () => ({ body: { results: state.txs, next: null } }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity({ fullName: "Fulana de Tal Sintética", document: "12345678901" })]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  return { ...w, state };
}

describe("Copiar diagnóstico", () => {
  it("leva versões, /auth, a Conexão com estado, datas e produtos", async () => {
    const w = await world();
    w.state.item = item({
      status: "UPDATED",
      executionStatus: "PARTIAL_SUCCESS",
      nextAutoSyncAt: "2026-11-10T06:00:00.000Z",
      statusDetail: { transactions: { isUpdated: false, updatedAt: null }, accounts: { isUpdated: true, updatedAt: "2026-11-01T06:00:00.000Z" } },
    } as never);
    await w.core.readConnection(ITEM_ID);

    const text = await w.core.diagnostic();

    expect(text).toContain("App 1.2.3");
    expect(text).toContain("atualização ota-abc");
    expect(text).toContain("/auth: HTTP 200");
    expect(text).toContain("Conexão 1: MeuPluggy");
    expect(text).toContain("status UPDATED");
    expect(text).toContain("execução PARTIAL_SUCCESS");
    expect(text).toContain("transactions=não");
    expect(text).toContain("accounts=sim");
    expect(text).toContain("lastUpdatedAt 2026-11-01T06:00:00.000Z");
    expect(text).toContain("nextAutoSyncAt 2026-11-10T06:00:00.000Z");
    expect(text).toContain("consentExpiresAt 2027-01-10T12:00:00.000Z");
    expect(text).toContain("leitura completa");
  });

  it("leva o error.code, nunca o error.message nem o providerMessage", async () => {
    const w = await world();
    await w.core.readConnection(ITEM_ID);
    w.state.item = item({
      status: "LOGIN_ERROR",
      error: { code: "INVALID_CREDENTIALS", message: "MENSAGEM DO BANCO SENSIVEL", providerMessage: "PROVIDER MESSAGE SENSIVEL" },
    } as never);
    await w.core.sync({ manual: true });

    const text = await w.core.diagnostic();

    expect(text).toContain("erro INVALID_CREDENTIALS");
    expect(text).not.toContain("SENSIVEL");
  });

  it("leva a última falha local com {id} no endpoint, o HTTP e as falhas seguidas", async () => {
    const w = await world();
    await w.core.readConnection(ITEM_ID);
    w.fetch.on("GET", `${API}/accounts`, { status: 500, body: {} });
    w.state.item = item({ lastUpdatedAt: "2026-11-06T06:00:00.000Z" } as never);
    await w.core.sync({ manual: true });
    const first = await w.core.diagnostic();
    expect(first).toMatch(/Última falha local: GET \/accounts \(HTTP 500\)/);

    w.fetch.on("GET", `${API}/investments/55555555-0000-0000-0000-000000000001/transactions`, { status: 502, body: {} });
    await w.core.pluggyRequest("GET", `/investments/55555555-0000-0000-0000-000000000001/transactions`);
    const text = await w.core.diagnostic();

    expect(text).toContain("GET /investments/{id}/transactions (HTTP 502), 4 seguidas");
    expect(text).not.toContain("55555555");
  });

  it("leva o percentual da trava quando ela disparou", async () => {
    const w = await world();
    await w.core.readConnection(ITEM_ID);
    w.state.txs = [tx(1), tx(2), tx(3)]; // 2 of 5 vanish: 40%
    w.state.item = item({ lastUpdatedAt: "2026-11-06T06:00:00.000Z" } as never);
    await w.core.sync({ manual: false });

    expect(await w.core.diagnostic()).toContain("trava 40%");
  });

  it("nunca leva valores, descrições, nomes, CPF, Client ID/Secret nem ids", async () => {
    const w = await world();
    w.state.item = item({
      status: "LOGIN_ERROR",
      error: { code: "ACCOUNT_LOCKED", message: "MENSAGEM DO BANCO SENSIVEL", providerMessage: "PROVIDER MESSAGE SENSIVEL" },
    } as never);
    await w.core.readConnection(ITEM_ID);
    await w.core.sync({ manual: true });
    w.fetch.on("GET", `${API}/accounts`, { status: 500, body: {} });
    w.state.item = item({ lastUpdatedAt: "2026-11-06T06:00:00.000Z" } as never);
    await w.core.sync({ manual: true });

    const text = await w.core.diagnostic();

    for (const forbidden of SENSITIVE) expect(text).not.toContain(forbidden);
    expect(text.length).toBeGreaterThan(100);
  });
});
