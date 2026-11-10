import { describe, expect, it } from "vitest";
import { authError, authResponse, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const AUTH = "https://api.pluggy.ai/auth";
const creds = { clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET };

describe("Credenciais", () => {
  it("um app recém-instalado ainda não tem Credenciais salvas", async () => {
    const { core } = await createTestWorld();
    expect(await core.credentialsStatus()).toEqual({ saved: false });
  });

  it("o 200 do /auth salva as Credenciais: Client Secret no cofre, Client ID no banco", async () => {
    const { core, fetch, secret } = await createTestWorld();
    fetch.on("POST", AUTH, { body: authResponse() });

    const result = await core.saveCredentials(creds);

    expect(result).toEqual({ ok: true });
    expect(fetch.callsTo("POST", AUTH)[0]!.body).toEqual({
      clientId: SYNTHETIC_CLIENT_ID,
      clientSecret: SYNTHETIC_CLIENT_SECRET,
    });
    expect(secret.value).toBe(SYNTHETIC_CLIENT_SECRET);
    expect(await core.credentialsStatus()).toEqual({ saved: true, clientId: SYNTHETIC_CLIENT_ID });
  });

  it("depois de salvas, o app reaberto continua com as Credenciais", async () => {
    const world = await createTestWorld();
    world.fetch.on("POST", AUTH, { body: authResponse() });
    await world.core.saveCredentials(creds);

    expect(await world.restart().credentialsStatus()).toEqual({ saved: true, clientId: SYNTHETIC_CLIENT_ID });
  });

  it.each([401, 403] as const)("o %i do /auth vira 'credenciais recusadas' e não salva nada", async (status) => {
    const { core, fetch, secret } = await createTestWorld();
    fetch.on("POST", AUTH, authError(status));

    const result = await core.saveCredentials(creds);

    expect(result).toMatchObject({ ok: false, error: { kind: "refused" } });
    expect(secret.value).toBeNull();
    expect(await core.credentialsStatus()).toEqual({ saved: false });
  });

  it("erro de rede vira 'sem internet' e não salva nada", async () => {
    const { core, fetch, secret } = await createTestWorld();
    fetch.goOffline();

    const result = await core.saveCredentials(creds);

    expect(result).toMatchObject({ ok: false, error: { kind: "offline" } });
    expect(secret.value).toBeNull();
    expect(await core.credentialsStatus()).toEqual({ saved: false });
  });

  it("qualquer outra resposta cai na mensagem genérica e não salva nada", async () => {
    const { core, fetch, secret } = await createTestWorld();
    fetch.on("POST", AUTH, { status: 500, body: {} });

    const result = await core.saveCredentials(creds);

    expect(result).toMatchObject({ ok: false, error: { kind: "unexpected" } });
    expect(secret.value).toBeNull();
  });

  it("cada erro traz a frase e o link para a seção certa de Problemas comuns", async () => {
    const { core, fetch } = await createTestWorld();
    const guide = "https://github.com/Kaioabreu/financas/blob/main/docs/guia-de-entrada.md";

    fetch.on("POST", AUTH, authError(401));
    const refused = await core.saveCredentials(creds);
    fetch.goOffline();
    const offline = await core.saveCredentials(creds);
    fetch.goOnline();
    fetch.on("POST", AUTH, { status: 500 });
    const unexpected = await core.saveCredentials(creds);

    expect(refused).toMatchObject({
      error: {
        message: "Confira se copiou inteiro. Perdeu o secret? Gere outro no Dashboard.",
        helpUrl: `${guide}#credenciais-recusadas`,
      },
    });
    expect(offline).toMatchObject({
      error: { message: "Sem internet. Conecte-se e tente de novo.", helpUrl: `${guide}#sem-internet` },
    });
    expect(unexpected).toMatchObject({ error: { helpUrl: `${guide}#problemas-comuns` } });
  });

  it("campos em branco não chegam ao Pluggy", async () => {
    const { core, fetch } = await createTestWorld();

    const result = await core.saveCredentials({ clientId: "  ", clientSecret: "" });

    expect(result).toMatchObject({ ok: false, error: { kind: "missing" } });
    expect(fetch.calls).toHaveLength(0);
  });
});

describe("apiKey", () => {
  const ITEMS = "https://api.pluggy.ai/items/abc";

  async function worldWithCredentials() {
    const world = await createTestWorld();
    let n = 0;
    world.fetch.on("POST", AUTH, () => ({ body: authResponse(`key-${++n}`) }));
    world.fetch.on("GET", ITEMS, { body: {} });
    await world.core.saveCredentials(creds);
    return world;
  }

  it("fica na memória e é reaproveitada dentro das 2 h", async () => {
    const { core, fetch, clock } = await worldWithCredentials();
    fetch.calls.length = 0;

    await core.pluggyRequest("GET", "/items/abc");
    clock.advance(119 * 60_000);
    await core.pluggyRequest("GET", "/items/abc");

    expect(fetch.callsTo("POST", AUTH)).toHaveLength(0);
    expect(fetch.callsTo("GET", ITEMS).map((c) => c.headers["X-API-KEY"])).toEqual(["key-1", "key-1"]);
  });

  it("é pedida de novo quando vence, 2 h depois", async () => {
    const { core, fetch, clock } = await worldWithCredentials();
    fetch.calls.length = 0;

    clock.advance(2 * 60 * 60 * 1000);
    await core.pluggyRequest("GET", "/items/abc");

    expect(fetch.callsTo("POST", AUTH)).toHaveLength(1);
    expect(fetch.callsTo("GET", ITEMS)[0]!.headers["X-API-KEY"]).toBe("key-2");
  });

  it("depois de reabrir o app, é pedida de novo com o Client Secret do cofre", async () => {
    const world = await worldWithCredentials();
    world.fetch.calls.length = 0;

    await world.restart().pluggyRequest("GET", "/items/abc");

    expect(world.fetch.callsTo("POST", AUTH)[0]!.body).toEqual({
      clientId: SYNTHETIC_CLIENT_ID,
      clientSecret: SYNTHETIC_CLIENT_SECRET,
    });
  });
});
