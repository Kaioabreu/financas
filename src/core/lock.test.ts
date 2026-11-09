import { describe, expect, it } from "vitest";
import { authResponse, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const API = "https://api.pluggy.ai";
const MIN = 60_000;

async function world(options: { deviceHasLock?: boolean; saved?: boolean } = {}) {
  const w = await createTestWorld({ deviceHasLock: options.deviceHasLock ?? true });
  if (options.saved !== false) {
    w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
    await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  }
  return w;
}

describe("Bloqueio por biometria", () => {
  it("pede ao abrir do zero", async () => {
    const w = await world();
    expect(await w.core.lock.mustPrompt()).toBe(true);
    w.core.lock.unlock();
    expect(await w.core.lock.mustPrompt()).toBe(false);
  });

  it("não pede antes de as credenciais serem salvas", async () => {
    const w = await world({ saved: false });
    expect(await w.core.lock.mustPrompt()).toBe(false);
  });

  it("não pede ao voltar antes de 1 min, e pede depois de 1 min", async () => {
    const w = await world();
    w.core.lock.unlock();
    w.core.lock.appBackgrounded();
    w.clock.advance(59_000);
    w.core.lock.appForegrounded();
    expect(await w.core.lock.mustPrompt()).toBe(false);

    w.core.lock.appBackgrounded();
    w.clock.advance(MIN);
    w.core.lock.appForegrounded();
    expect(await w.core.lock.mustPrompt()).toBe(true);
  });

  it("nunca pede durante a Custom Tab do Meu Pluggy", async () => {
    const w = await world();
    w.core.lock.unlock();
    const tab = new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    const during = w.core.lock.duringExternalFlow(tab);
    w.core.lock.appBackgrounded();
    w.clock.advance(5 * MIN);
    w.core.lock.appForegrounded();
    await during;
    w.core.lock.appForegrounded();
    expect(await w.core.lock.mustPrompt()).toBe(false);
  });

  it("vem ligado, e o interruptor desliga e liga de novo", async () => {
    const w = await world();
    expect(await w.core.lock.settings()).toEqual({ enabled: true, available: true });
    await w.core.lock.setEnabled(false);
    expect((await w.restart().lock.settings()).enabled).toBe(false);
    expect(await w.restart().lock.mustPrompt()).toBe(false);
    await w.core.lock.setEnabled(true);
    expect((await w.restart().lock.settings()).enabled).toBe(true);
  });

  it("sem bloqueio de tela no aparelho, o interruptor fica indisponível e o app não pede nada", async () => {
    const w = await world({ deviceHasLock: false });
    expect(await w.core.lock.settings()).toEqual({ enabled: true, available: false });
    expect(await w.core.lock.mustPrompt()).toBe(false);
  });
});
