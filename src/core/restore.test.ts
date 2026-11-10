import { describe, expect, it } from "vitest";
import { account, authResponse, creditCard, identity, item, page, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET, transaction } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";
import type { BackupFilePort, BackupInspection } from "./restore";

const API = "https://api.pluggy.ai";
const ITEM = "11111111-0000-0000-0000-000000000001";
const NEW_ITEM = "11111111-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const APP_MIGRATIONS = [100, 200, 300];

function port(inspection: BackupInspection) {
  const calls: string[] = [];
  const file: BackupFilePort = {
    appMigrations: APP_MIGRATIONS,
    inspect: async (uri, password) => {
      calls.push(`inspect:${uri}:${password}`);
      return inspection;
    },
    replaceAll: async () => void calls.push("replaceAll"),
  };
  return { file, calls };
}
const good: BackupInspection = { ok: true, clientId: SYNTHETIC_CLIENT_ID, migrations: APP_MIGRATIONS };

/** The phone the backup came from: an Item already read. Its database is what the new phone restores. */
async function oldPhone() {
  const w = await createTestWorld({ startAt: "2026-11-09T12:00:00.000Z" });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM}`, { body: item({ lastUpdatedAt: "2026-11-09T06:00:00.000Z" }) });
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, { body: { results: [transaction({ description: "COMPRA SINTETICA" })], next: null } });
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM, { tabClosed: NEVER });
  await w.core.readConnection(ITEM);
  return w;
}

/** A new phone: the database holds what the restore copied (here: the old one), the secret store is empty. */
async function newPhone(inspection: BackupInspection = good) {
  const w = await oldPhone();
  w.secret.value = null;
  const { file, calls } = port(inspection);
  const core = w.restart({}, file);
  return { ...w, core, calls };
}

describe("Restaurar backup", () => {
  it("senha errada: o erro previsto, e nada é substituído", async () => {
    const w = await newPhone({ ok: false, reason: "wrong-password" });
    const result = await w.core.restoreBackup({ uri: "file:///b.financas", password: "errada", clientSecret: SYNTHETIC_CLIENT_SECRET });
    expect(result).toMatchObject({ ok: false, kind: "wrong-password" });
    expect(w.calls).not.toContain("replaceAll");
  });

  it("backup mais novo que o app: recusa com a frase da spec", async () => {
    const w = await newPhone({ ok: true, clientId: SYNTHETIC_CLIENT_ID, migrations: [...APP_MIGRATIONS, 400] });
    const result = await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET });
    expect(result).toEqual({ ok: false, kind: "newer", message: "Atualize o app para restaurar este backup" });
    expect(w.calls).not.toContain("replaceAll");
  });

  it("backup mais antigo: restaura (as migrações do app o completam)", async () => {
    const w = await newPhone({ ok: true, clientId: SYNTHETIC_CLIENT_ID, migrations: [100, 200] });
    const result = await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET });
    expect(result).toEqual({ ok: true });
    expect(w.calls).toContain("replaceAll");
  });

  it("Client Secret recusado pelo Pluggy: não substitui nada e deixa tentar de novo", async () => {
    const w = await newPhone();
    w.fetch.on("POST", `${API}/auth`, { status: 403 });
    const result = await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: "errado" });
    expect(result).toMatchObject({ ok: false, kind: "credentials" });
    expect(w.calls).not.toContain("replaceAll");
    expect(w.secret.value).toBeNull();
  });

  it("confere o secret com o Client ID que veio no backup e o guarda", async () => {
    const w = await newPhone();
    const result = await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET });
    expect(result).toEqual({ ok: true });
    expect(w.fetch.calls.at(-1)?.body).toEqual({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
    expect(w.secret.value).toBe(SYNTHETIC_CLIENT_SECRET);
    expect(await w.core.credentialsStatus()).toEqual({ saved: true, clientId: SYNTHETIC_CLIENT_ID });
  });

  it("só existe na primeira abertura: com credenciais salvas, recusa", async () => {
    const w = await oldPhone();
    const { file, calls } = port(good);
    const core = w.restart({}, file);
    expect(await core.canRestore()).toBe(false);
    expect(await core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET })).toMatchObject({ ok: false, kind: "not-first-open" });
    expect(calls).toEqual([]);
  });

  it("na primeira abertura (sem credenciais) pode restaurar", async () => {
    const w = await newPhone();
    expect(await w.core.canRestore()).toBe(true);
  });
});

describe("Depois de restaurar", () => {
  it("as Conexões sincronizam com os itemIds do backup, sem reconectar", async () => {
    const w = await newPhone();
    await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET });
    w.clock.advance(3 * 86_400_000);
    w.fetch.on("GET", `${API}/items/${ITEM}`, { body: item({ lastUpdatedAt: "2026-11-12T06:00:00.000Z" }) });
    await w.core.sync({ manual: true });
    const [conn] = await w.core.listConnections();
    expect(conn).toMatchObject({ itemId: ITEM, state: "ok" });
    expect(w.fetch.callsTo("GET", `${API}/items/${ITEM}`).length).toBeGreaterThan(0);
  });

  it("o item que deu 404 (renovado depois do backup) vira a reconectar, e o login devolve os dados a ela", async () => {
    const w = await newPhone();
    await w.core.restoreBackup({ uri: "u", password: "p", clientSecret: SYNTHETIC_CLIENT_SECRET });
    w.clock.advance(3 * 86_400_000);
    w.fetch.on("GET", `${API}/items/${ITEM}`, { status: 404 });
    await w.core.sync({ manual: true });
    expect((await w.core.listConnections())[0]).toMatchObject({ itemId: ITEM, state: "reconnect" });

    w.fetch.on("GET", `${API}/items/${NEW_ITEM}`, { body: item({ id: NEW_ITEM, lastUpdatedAt: "2026-11-12T06:00:00.000Z", consentExpiresAt: "2027-11-12T12:00:00.000Z" }) });
    w.fetch.on("DELETE", `${API}/items/${NEW_ITEM}`, { body: {} });
    w.fetch.on("GET", `${API}/accounts`, { body: page([account({ itemId: NEW_ITEM }), creditCard({ itemId: NEW_ITEM })]) });
    expect(await w.core.finishConnect(NEW_ITEM, { tabClosed: NEVER })).toEqual({ ok: true, renewed: true });
    const conns = await w.core.listConnections();
    expect(conns.map((c) => c.itemId)).toEqual([NEW_ITEM]);
    expect(await w.core.listTransactions({ accountId: account().id, month: "2026-10" })).toHaveLength(1);
  });
});
