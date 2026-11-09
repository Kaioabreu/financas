import { describe, expect, it } from "vitest";
import { account, authResponse, creditCard, identity, item, page, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET, transaction } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const API = "https://api.pluggy.ai";
const ITEM_ID = "11111111-0000-0000-0000-000000000001";
const BANK = "22222222-0000-0000-0000-000000000001";
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const tid = (n: number) => `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`;

const bankTx = (n: number, overrides: Record<string, unknown> = {}) =>
  transaction({
    id: tid(n),
    accountId: BANK,
    date: "2026-10-20T12:00:00.000Z",
    type: "DEBIT",
    amount: -30,
    category: null,
    categoryId: null,
    ...overrides,
  } as never);

async function world() {
  const w = await createTestWorld();
  const state = { bank: [] as object[] };
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item() }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => ({
    body: { results: call.url.includes(`accountId=${CARD}`) ? [] : state.bank, next: null },
  }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity({ document: "52998224725" })]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  const rows = async () => {
    const list = await w.core.listTransactions({ accountId: BANK, month: "2026-10" });
    return Object.fromEntries(list.map((r) => [r.description, r]));
  };
  return {
    ...w,
    rows,
    async read(bank: object[]) {
      state.bank = bank;
      await w.core.readConnection(ITEM_ID);
      return rows();
    },
  };
}

describe("Edição à mão", () => {
  it("vence a regra embutida e a dedução, e a origem passa a ser 'manual'", async () => {
    const w = await world();
    const before = await w.read([
      bankTx(1, { description: "TAXA SOBRE VALOR EM CUSTODIA" }),
      bankTx(2, { description: "MERCADO X", category: "Groceries" }),
    ]);
    expect(before["TAXA SOBRE VALOR EM CUSTODIA"]).toMatchObject({ nature: "expense", category: "fees-taxes", source: "rule" });
    expect(before["MERCADO X"]).toMatchObject({ category: "groceries", source: "pluggy" });

    await w.core.editTransaction(tid(1), { nature: "investment" });
    await w.core.editTransaction(tid(2), { nature: "expense", category: "leisure" });
    const after = await w.rows();
    expect(after["TAXA SOBRE VALOR EM CUSTODIA"]).toMatchObject({ nature: "investment", source: "manual" });
    expect(after["TAXA SOBRE VALOR EM CUSTODIA"].category).toBeUndefined();
    expect(after["MERCADO X"]).toMatchObject({ nature: "expense", category: "leisure", source: "manual" });
  });
});

describe("Regras do usuário", () => {
  it("casa pela descrição sem diferenciar maiúsculas nem acentos, e vale para as passadas e as futuras", async () => {
    const w = await world();
    await w.read([bankTx(1, { description: "Padaria São João" }), bankTx(2, { description: "OUTRA COISA" })]);
    expect(await w.core.previewRule({ contains: "SAO joao", nature: "expense", category: "food" })).toEqual({ count: 1 });
    expect(await w.core.addRule({ contains: "SAO joao", nature: "expense", category: "food" })).toEqual({ ok: true });
    let rows = await w.rows();
    expect(rows["Padaria São João"]).toMatchObject({ nature: "expense", category: "food", source: "rule" });
    expect(rows["OUTRA COISA"].source).toBe("pluggy");

    rows = await w.read([bankTx(1, { description: "Padaria São João" }), bankTx(3, { description: "padaria sao joao filial" })]);
    expect(rows["padaria sao joao filial"]).toMatchObject({ category: "food", source: "rule" });
  });

  it("a regra pode dar só a categoria, mantendo a natureza deduzida, ou só a natureza", async () => {
    const w = await world();
    await w.read([
      bankTx(1, { description: "LOJA A" }),
      bankTx(2, { description: "ENTRADA B", type: "CREDIT", amount: 50 }),
    ]);
    await w.core.addRule({ contains: "loja a", category: "shopping" });
    await w.core.addRule({ contains: "entrada b", nature: "refund" });
    const rows = await w.rows();
    expect(rows["LOJA A"]).toMatchObject({ nature: "expense", category: "shopping" });
    expect(rows["ENTRADA B"]).toMatchObject({ nature: "refund" });
    expect(rows["ENTRADA B"].category).toBeUndefined();
    expect(rows["ENTRADA B"].origin).toBeUndefined();
  });

  it("entre duas regras do usuário vence a mais recente", async () => {
    const w = await world();
    await w.read([bankTx(1, { description: "UBER TRIP" })]);
    await w.core.addRule({ contains: "uber", nature: "expense", category: "transport" });
    await w.core.addRule({ contains: "trip", nature: "expense", category: "leisure" });
    expect((await w.rows())["UBER TRIP"].category).toBe("leisure");
  });

  it("a regra vence a regra embutida e a dedução, e a edição à mão vence a regra", async () => {
    const w = await world();
    await w.read([bankTx(1, { description: "TAXA SOBRE VALOR EM CUSTODIA" }), bankTx(2, { description: "TAXA SOBRE VALOR EM CUSTODIA 2" })]);
    await w.core.addRule({ contains: "custodia", nature: "expense", category: "other" });
    let rows = await w.rows();
    expect(rows["TAXA SOBRE VALOR EM CUSTODIA"]).toMatchObject({ category: "other", source: "rule" });

    await w.core.editTransaction(tid(2), { nature: "expense", category: "health" });
    await w.core.addRule({ contains: "custodia", nature: "investment" });
    rows = await w.rows();
    expect(rows["TAXA SOBRE VALOR EM CUSTODIA"]).toMatchObject({ nature: "investment", source: "rule" });
    expect(rows["TAXA SOBRE VALOR EM CUSTODIA 2"]).toMatchObject({ nature: "expense", category: "health", source: "manual" });
  });

  it("a prévia não conta as transações editadas à mão", async () => {
    const w = await world();
    await w.read([bankTx(1, { description: "IFOOD A" }), bankTx(2, { description: "IFOOD B" }), bankTx(3, { description: "OUTRO" })]);
    await w.core.editTransaction(tid(2), { nature: "expense", category: "health" });
    expect(await w.core.previewRule({ contains: "ifood", category: "food" })).toEqual({ count: 1 });
  });

  it("recusa regra sem texto ou sem resultado, e apagar tira o efeito", async () => {
    const w = await world();
    await w.read([bankTx(1, { description: "LOJA" })]);
    expect((await w.core.addRule({ contains: "  ", category: "food" })).ok).toBe(false);
    expect((await w.core.addRule({ contains: "loja" })).ok).toBe(false);
    await w.core.addRule({ contains: "loja", category: "food" });
    const { user, builtIn } = await w.core.listRules();
    expect(user).toHaveLength(1);
    expect(builtIn.length).toBeGreaterThan(0);
    await w.core.deleteRule(user[0]!.id);
    expect((await w.core.listRules()).user).toEqual([]);
    expect((await w.rows()).LOJA.source).toBe("pluggy");
  });
});

describe("A edição segue a transação recriada", () => {
  // An old transaction keeps the read's period open, so what vanishes after it is really removed.
  // (And enough of them that the vanished one stays under the 20% delete lock.)
  const filler = Array.from({ length: 10 }, (_, i) => bankTx(50 + i, { description: `FILLER ${i}`, date: "2026-10-01T12:00:00.000Z" }));
  const original = (over: Record<string, unknown> = {}) => bankTx(1, { description: "COMPRA X", amount: -42, ...over });

  it("passa para a nova (mesma conta, valor e descrição, até 5 dias depois) na mesma leitura", async () => {
    const w = await world();
    await w.read([...filler, original()]);
    await w.core.editTransaction(tid(1), { nature: "expense", category: "health" });
    const rows = await w.read([...filler, bankTx(9, { description: "COMPRA X", amount: -42, date: "2026-10-25T12:00:00.000Z" })]);
    expect(rows["COMPRA X"]).toMatchObject({ id: tid(9), category: "health", source: "manual" });
  });

  it("não passa quando a data passa de 5 dias, o valor ou a descrição mudam, ou a nova é anterior", async () => {
    for (const change of [
      { date: "2026-10-26T12:00:00.000Z" },
      { amount: -43 },
      { description: "COMPRA Y" },
      { date: "2026-10-19T12:00:00.000Z" },
    ]) {
      const w = await world();
      await w.read([...filler, original()]);
      await w.core.editTransaction(tid(1), { nature: "expense", category: "health" });
      const rows = await w.read([...filler, bankTx(9, { description: "COMPRA X", amount: -42, date: "2026-10-20T12:00:00.000Z", ...change })]);
      expect(Object.values(rows)[0]).toMatchObject({ id: tid(9), source: "pluggy" });
    }
  });

  it("não passa para uma transação que já existia, nem quando a original continua", async () => {
    const w = await world();
    await w.read([...filler, original(), bankTx(5, { description: "COMPRA X", amount: -42, date: "2026-10-22T12:00:00.000Z" })]);
    await w.core.editTransaction(tid(1), { nature: "expense", category: "health" });
    // the original vanishes but the other one was already there: nothing new appeared
    let rows = await w.read([...filler, bankTx(5, { description: "COMPRA X", amount: -42, date: "2026-10-22T12:00:00.000Z" })]);
    expect(rows["COMPRA X"].source).toBe("pluggy");
    // the original stays: a new look-alike does not take the edit
    const w2 = await world();
    await w2.read([...filler, original()]);
    await w2.core.editTransaction(tid(1), { nature: "expense", category: "health" });
    rows = await w2.read([...filler, original(), bankTx(9, { description: "COMPRA X", amount: -42, date: "2026-10-22T12:00:00.000Z" })]);
    expect((await w2.core.listTransactions({ accountId: BANK, month: "2026-10" })).find((r) => r.id === tid(9))!.source).toBe("pluggy");
  });
});
