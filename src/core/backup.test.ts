import { describe, expect, it } from "vitest";
import { account, authResponse, creditCard, identity, item, page, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET, transaction } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";
import { backupNotice, buildNotices } from "./status";

const API = "https://api.pluggy.ai";
const ITEM = "11111111-0000-0000-0000-000000000001";
const DAY = 86_400_000;
const NEVER = new Promise<void>(() => {});

async function world(opts: { synced?: boolean } = {}) {
  const w = await createTestWorld({ startAt: "2026-11-09T12:00:00.000Z" });
  if (opts.synced === false) return w;
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

describe("Senha do Backup", () => {
  it("começa sem senha e sem backup", async () => {
    const w = await world({ synced: false });
    expect(await w.core.backupStatus()).toEqual({ passwordSet: false, lastBackupAt: null });
  });

  it("exige no mínimo 8 caracteres e a mesma senha digitada duas vezes", async () => {
    const w = await world({ synced: false });
    expect(await w.core.createBackupPassword("curta", "curta")).toEqual({ ok: false, reason: "too-short" });
    expect(await w.core.createBackupPassword("senha-longa-1", "senha-longa-2")).toEqual({ ok: false, reason: "mismatch" });
    expect((await w.core.backupStatus()).passwordSet).toBe(false);
    expect(await w.core.createBackupPassword("senha-longa-1", "senha-longa-1")).toEqual({ ok: true });
    expect((await w.core.backupStatus()).passwordSet).toBe(true);
  });

  it("confere a senha contra o verificador e nunca guarda a senha", async () => {
    const w = await world({ synced: false });
    await w.core.createBackupPassword("senha-longa-1", "senha-longa-1");
    expect(await w.core.verifyBackupPassword("senha-longa-1")).toBe(true);
    expect(await w.core.verifyBackupPassword("senha-errada-1")).toBe(false);
    const dump = JSON.stringify(await w.dumpMeta());
    expect(dump).not.toContain("senha-longa-1");
  });

  it("'Criar nova senha' troca o verificador", async () => {
    const w = await world({ synced: false });
    await w.core.createBackupPassword("senha-longa-1", "senha-longa-1");
    expect(await w.core.createBackupPassword("outra-senha-9", "outra-senha-9")).toEqual({ ok: true });
    expect(await w.core.verifyBackupPassword("senha-longa-1")).toBe(false);
    expect(await w.core.verifyBackupPassword("outra-senha-9")).toBe(true);
  });
});

describe("Último backup", () => {
  it("recordBackup guarda a data", async () => {
    const w = await world({ synced: false });
    await w.core.recordBackup();
    expect((await w.core.backupStatus()).lastBackupAt).toBe("2026-11-09T12:00:00.000Z");
  });
});

describe("Aviso de backup no Resumo", () => {
  it("não aparece antes da primeira sincronização", async () => {
    const w = await world({ synced: false });
    expect((await w.core.notices()).shown).toBeNull();
  });

  it("aparece depois da primeira sincronização se nunca houve backup", async () => {
    const w = await world();
    const n = (await w.core.notices()).shown;
    expect(n).toMatchObject({ kind: "backup", action: "backup", snoozable: true, text: "Você ainda não fez um backup · Fazer backup" });
  });

  it("some depois de um backup", async () => {
    const w = await world();
    await w.core.recordBackup();
    expect((await w.core.notices()).shown).toBeNull();
  });

  it("passou de 30 dias: avisa com os dias no texto", () => {
    const now = Date.parse("2026-11-09T12:00:00.000Z");
    expect(backupNotice("2026-10-10T12:00:00.000Z", true, now)).toBeNull(); // exatos 30 dias
    expect(backupNotice("2026-10-06T12:00:00.000Z", true, now)?.text).toBe("Seu último backup tem 34 dias · Fazer backup");
  });

  it("entra por último na fila", () => {
    const now = Date.parse("2026-11-09T12:00:00.000Z");
    const backup = backupNotice(null, true, now);
    const source = { itemId: "i1", bankName: "BTG", state: "expiring", daysLeft: 5, status: null };
    const q = buildNotices(false, [source], () => 0, now, backup);
    expect(q.shown?.kind).toBe("expiring");
    expect(q.more).toBe(1);
    expect(buildNotices(false, [], () => 0, now, backup).shown?.kind).toBe("backup");
  });

  it("'Agora não' adia por 30 dias", async () => {
    const w = await world();
    await w.core.snoozeNotice("backup");
    expect((await w.core.notices()).shown).toBeNull();
    w.clock.advance(2 * DAY);
    expect((await w.core.notices()).shown?.kind).not.toBe("backup"); // ainda adiado
    w.clock.advance(29 * DAY);
    const kinds = [];
    for (let i = 0; i < 2; i++) {
      const n = (await w.core.notices()).shown;
      if (!n) break;
      kinds.push(n.kind);
      await w.core.snoozeNotice(n.key);
    }
    expect(kinds).toContain("backup");
  });
});
