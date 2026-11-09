import { describe, expect, it } from "vitest";
import {
  account,
  authResponse,
  bill,
  creditCard,
  investment,
  investmentTransaction,
  item,
  page,
  SYNTHETIC_CLIENT_ID,
  SYNTHETIC_CLIENT_SECRET,
  transaction,
} from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const API = "https://api.pluggy.ai";
const SGS = "https://api.bcb.gov.br/dados/serie";
const NEVER = new Promise<void>(() => {});
const DAY = 86_400_000;
const BANK_A = "11111111-0000-0000-0000-000000000001";
const BANK_B = "11111111-0000-0000-0000-000000000002";
const ACC_A = "22222222-0000-0000-0000-00000000000a";
const ACC_B = "22222222-0000-0000-0000-00000000000b";
const CARD_A = "22222222-0000-0000-0000-00000000000c";

interface Bank {
  id: string;
  name: string;
  accounts: object[];
  investments: object[];
  txs: Record<string, object[]>;
  bills: Record<string, object[]>;
  invTxs: Record<string, object[]>;
}
const newBank = (id: string, name: string, accounts: object[], extra: Partial<Bank> = {}): Bank => ({
  id,
  name,
  accounts,
  investments: [],
  txs: {},
  bills: {},
  invTxs: {},
  ...extra,
});
const bankAccount = (id: string, itemId: string, balance: number) => account({ id, itemId, balance } as never);
const tx = (n: number, accountId: string, type: "DEBIT" | "CREDIT", amount: number, date: string) =>
  transaction({ id: `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`, accountId, type, amount, date: `${date}T12:00:00.000Z` } as never);
const cdb = (n: number, itemId: string, over: Record<string, unknown>) =>
  ({
    ...investment({ id: `55555555-0000-0000-0000-${String(n).padStart(12, "0")}`, itemId, type: "FIXED_INCOME", subtype: "CDB" } as never),
    ...over,
  }) as never;

/** Series answers as the SGS sends them: a list of {data, valor}. */
const sgs = (rows: [string, string][]) => ({ body: rows.map(([data, valor]) => ({ data, valor })) });

async function world(startAt = "2026-11-09T12:00:00.000Z") {
  const w = await createTestWorld({ startAt });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const banks = new Map<string, Bank>();
  const itemOf = (call: { url: string }) => /itemId=([^&]+)/.exec(call.url)![1]!;
  w.fetch.on("GET", `${API}/accounts`, (c) => ({ body: page(banks.get(itemOf(c))!.accounts) }));
  w.fetch.on("GET", `${API}/investments`, (c) => ({ body: page(banks.get(itemOf(c))!.investments) }));
  w.fetch.on("GET", `${API}/identity`, { status: 404 });
  w.fetch.on("GET", `${API}/v2/transactions`, (c) => {
    const id = /accountId=([^&]+)/.exec(c.url)![1]!;
    return { body: { results: [...banks.values()].flatMap((b) => b.txs[id] ?? []), next: null } };
  });
  w.fetch.on("GET", `${API}/bills`, (c) => {
    const id = /accountId=([^&]+)/.exec(c.url)![1]!;
    return { body: page([...banks.values()].flatMap((b) => b.bills[id] ?? [])) };
  });
  for (const id of [BANK_A, BANK_B]) {
    w.fetch.on("GET", `${API}/items/${id}`, () => ({ body: item({ id, lastUpdatedAt: new Date(w.clock.now()).toISOString() }) }));
    w.fetch.on("GET", `${API}/items/${id}/resources`, { body: page([]) });
  }
  return {
    ...w,
    /** The bank connects for the first time and is read. */
    async connect(bank: Bank) {
      banks.set(bank.id, bank);
      for (const [n, inv] of bank.investments.entries()) void n, void inv;
      for (const inv of bank.investments as { id: string }[]) {
        w.fetch.on("GET", `${API}/investments/${inv.id}/transactions`, () => ({ body: page(bank.invTxs[inv.id] ?? []) }));
      }
      await w.core.finishConnect(bank.id, { tabClosed: NEVER });
      await w.core.readConnection(bank.id);
    },
    /** A later sync (the clock moved on). */
    async sync() {
      w.clock.advance(1000);
      for (const b of banks.values()) w.fetch.on("GET", `${API}/items/${b.id}`, () => ({ body: item({ id: b.id, lastUpdatedAt: new Date(w.clock.now()).toISOString() }) }));
      await w.core.sync({ manual: true });
    },
  };
}

/** The curve without today's point: month -> [total, estimated]. */
const past = async (w: Awaited<ReturnType<typeof world>>) =>
  Object.fromEntries((await w.core.netWorth()).curve.filter((p) => !p.today).map((p) => [p.month, [p.total, p.estimated]]));

describe("Estimativa: contas", () => {
  it("reconstrói o saldo de cada dia pelo saldo atual menos as transações, em cinza na curva", async () => {
    const w = await world();
    await w.connect(
      newBank(BANK_A, "BTG", [bankAccount(ACC_A, BANK_A, 1000)], {
        txs: {
          [ACC_A]: [
            tx(1, ACC_A, "CREDIT", 300, "2026-11-02"), // after the first read? no: before; it is in the past
            tx(2, ACC_A, "DEBIT", 100, "2026-10-20"),
            tx(3, ACC_A, "CREDIT", 500, "2026-08-15"),
            tx(4, ACC_A, "DEBIT", 50, "2026-03-10"),
          ],
        },
      }),
    );

    const curve = await past(w);

    // end of month balance = 1000 minus what came in after it, plus what went out after it
    expect(curve["2026-10"]).toEqual([700, true]); // 1000 - 300 (Nov 2)
    expect(curve["2026-09"]).toEqual([800, true]); // + 100 (Oct 20)
    expect(curve["2026-08"]).toEqual([800, true]);
    expect(curve["2026-07"]).toEqual([300, true]); // - 500 (Aug 15)
    expect(curve["2026-03"]).toEqual([300, true]);
    expect(curve["2026-02"]).toEqual([350, true]); // + 50 (Mar 10)
    expect(curve["2025-11"]).toEqual([350, true]);
    expect(curve["2025-10"]).toBeUndefined(); // 12 months only
  });
});

const mid = (w: Awaited<ReturnType<typeof world>>, cdi?: [string, string][], ipca?: [string, string][], ipca15?: [string, string][]) => {
  if (cdi) w.fetch.on("GET", `${SGS}/bcdata.sgs.12/dados`, sgs(cdi));
  if (ipca) w.fetch.on("GET", `${SGS}/bcdata.sgs.433/dados`, sgs(ipca));
  if (ipca15) w.fetch.on("GET", `${SGS}/bcdata.sgs.7478/dados`, sgs(ipca15));
};
const ISSUE = "2025-01-10T00:00:00.000Z";
const sgsCalls = (w: Awaited<ReturnType<typeof world>>, code: number) => w.fetch.calls.filter((c) => c.url.startsWith(`${SGS}/bcdata.sgs.${code}/dados`));
const idle = (itemId: string) => bankAccount(ACC_A, itemId, 0);

describe("Estimativa: renda fixa indexada", () => {
  it("rende o CDI contratado desde a emissão e bate com o valor da primeira leitura", async () => {
    const w = await world();
    mid(w, [["10/06/2026", "1.0"], ["10/10/2026", "1.0"]]);
    await w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [cdb(1, BANK_A, { balance: 1100, amountWithdrawal: 1100, amountOriginal: 1000, rateType: "CDI", rate: 100, issueDate: ISSUE })],
      }),
    );

    const curve = await past(w);

    expect(curve["2026-10"]).toEqual([1100, true]);
    expect(curve["2026-07"]![0]).toBeCloseTo(1089.11, 1); // 1100 / 1.01
    expect(curve["2026-05"]![0]).toBeCloseTo(1078.31, 1); // 1100 / 1.01^2
    const url = sgsCalls(w, 12)[0]!.url;
    expect(url).toContain("dataInicial=09/11/2025");
    expect(url).toContain("dataFinal=09/11/2026");
  });

  it("rende o IPCA do mês, com o IPCA-15 no mês sem IPCA", async () => {
    const w = await world();
    mid(w, undefined, [["01/09/2026", "1.0"]], [["01/09/2026", "9.0"], ["01/10/2026", "2.0"]]);
    await w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [cdb(1, BANK_A, { balance: 1100, amountWithdrawal: 1100, amountOriginal: 1000, rateType: "IPCA", fixedAnnualRate: 0, issueDate: ISSUE })],
      }),
    );

    const curve = await past(w);

    expect(curve["2026-10"]![0]).toBeCloseTo(1100, 1);
    expect(curve["2026-09"]![0]).toBeCloseTo(1078.43, 1); // 1100 / 1.02 (October from the IPCA-15)
    expect(curve["2026-08"]![0]).toBeCloseTo(1067.76, 1); // / 1.01 (September from the IPCA, not the 9% IPCA-15)
  });

  it("não conta o título antes da emissão", async () => {
    const w = await world();
    mid(w, [["10/10/2026", "1.0"]]);
    await w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [cdb(1, BANK_A, { balance: 1100, amountWithdrawal: 1100, amountOriginal: 1000, rateType: "CDI", rate: 100, issueDate: "2026-06-15T00:00:00.000Z" })],
      }),
    );
    const curve = await past(w);
    expect(curve["2026-05"]![0]).toBe(0);
    expect(curve["2026-06"]![0]).toBeGreaterThan(1000);
  });
});

describe("Estimativa: a reta", () => {
  const equity = (over: Record<string, unknown>) =>
    cdb(1, BANK_A, { type: "EQUITY", subtype: "STOCK", balance: 600, quantity: 10, value: 60, amountOriginal: null, ...over });

  it("com um ponto só, o preço fica parado e a posição bate com a primeira leitura (calibração)", async () => {
    const w = await world();
    await w.connect(newBank(BANK_A, "BTG", [idle(BANK_A)], { investments: [equity({ amountWithdrawal: 500 })] }));
    const curve = await past(w);
    expect(curve["2026-10"]).toEqual([500, true]);
    expect(curve["2025-11"]).toEqual([500, true]);
  });

  it("passa pelo amountOriginal na compra e pelo valor da primeira leitura", async () => {
    const w = await world();
    await w.connect(newBank(BANK_A, "BTG", [idle(BANK_A)], { investments: [equity({ amountOriginal: 400, purchaseDate: "2026-05-10T00:00:00.000Z" })] }));
    const curve = await past(w);
    expect(curve["2026-04"]![0]).toBe(0);
    expect(curve["2026-07"]![0]).toBeCloseTo(489.6, 0); // (40 + 20 * 82/183) * 10
    expect(curve["2026-10"]![0] as number).toBeGreaterThan(curve["2026-07"]![0] as number);
  });

  it("com vários pontos, reconstrói a quantidade para trás e ignora a operação sem quantidade", async () => {
    const w = await world();
    const inv = equity({});
    const id = (inv as { id: string }).id;
    const op = (n: number, type: string, date: string, quantity: number | null, value: number) =>
      investmentTransaction({ id: `66666666-0000-0000-0000-00000000000${n}`, type, date: `${date}T00:00:00.000Z`, tradeDate: `${date}T00:00:00.000Z`, quantity, value });
    await w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [inv],
        invTxs: { [id]: [op(1, "BUY", "2026-03-15", 4, 50), op(2, "BUY", "2026-08-15", 6, 55), op(3, "SELL", "2026-06-01", null, 70)] },
      }),
    );
    const curve = await past(w);
    expect(curve["2026-02"]![0]).toBe(0); // before the first purchase
    expect(curve["2026-07"]![0]).toBeCloseTo(218.04, 0); // 4 units at 50 + 5 * 138/153
    expect(curve["2026-10"]![0]).toBeCloseTo(594.77, 0); // 10 units at 55 + 5 * 77/86
  });
});

describe("Estimativa: uma vez por banco", () => {
  it("não refaz a cada leitura", async () => {
    const w = await world();
    await w.connect(newBank(BANK_A, "BTG", [bankAccount(ACC_A, BANK_A, 1000)]));
    const before = await past(w);
    w.clock.advance(DAY * 3);
    await w.sync();
    await w.sync();
    expect(await past(w)).toEqual(before);
    expect(await w.core.diagnostic()).toContain("estimativa: fechada · 1 tentativa");
  });

  it("um banco conectado depois soma os 12 meses dele aos retratos que já existem", async () => {
    const w = await world();
    await w.connect(newBank(BANK_A, "BTG", [bankAccount(ACC_A, BANK_A, 1000)]));
    w.clock.advance(DAY * 40); // Dec 19
    await w.connect(
      newBank(BANK_B, "Nubank", [bankAccount(ACC_B, BANK_B, 500)], { txs: { [ACC_B]: [tx(9, ACC_B, "DEBIT", 200, "2026-12-01")] } }),
    );

    const curve = await past(w);

    expect(curve["2025-11"]).toEqual([1000, true]); // only the first bank existed
    expect(curve["2025-12"]).toEqual([1700, true]); // 1000 + 700
    expect(curve["2026-11"]).toEqual([1700, true]);
  });
});

describe("Estimativa: fonte que falha", () => {
  const withCdb = (w: Awaited<ReturnType<typeof world>>) =>
    w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [cdb(1, BANK_A, { balance: 1100, amountWithdrawal: 1100, amountOriginal: 1000, rateType: "CDI", rate: 100, issueDate: ISSUE })],
      }),
    );

  it("fica pendente, avisa no Patrimônio, tenta a cada sincronização e fecha quando a fonte volta", async () => {
    const w = await world(); // the SGS has no route: 404
    await withCdb(w);

    expect((await w.core.netWorth()).estimating).toEqual(["MeuPluggy"]);
    expect(await past(w)).toEqual({});
    await w.sync();
    expect(await w.core.diagnostic()).toContain("estimativa: pendente · 2 tentativas · fonte que falhou SGS 12");

    mid(w, [["10/10/2026", "1.0"]]);
    await w.sync();

    expect((await w.core.netWorth()).estimating).toEqual([]);
    expect(Object.keys(await past(w))).toHaveLength(12);
    expect(await w.core.diagnostic()).toContain("estimativa: fechada · 3 tentativas");
  });

  it("depois de 7 dias fecha com a reta, sem tentar de novo", async () => {
    const w = await world();
    await withCdb(w);
    w.clock.advance(DAY * 7);
    await w.sync();

    expect((await w.core.netWorth()).estimating).toEqual([]);
    expect((await past(w))["2026-05"]![0]).toBeGreaterThan(0); // the straight line drew it
    expect(await w.core.diagnostic()).toContain("estimativa: fechada com a reta · 2 tentativas · fonte que falhou SGS 12");
    const calls = sgsCalls(w, 12).length;
    await w.sync();
    expect(sgsCalls(w, 12)).toHaveLength(calls);
  });

  it("guarda as séries baixadas em cache para a nova tentativa", async () => {
    const w = await world();
    mid(w, undefined, [["01/09/2026", "1.0"]]);
    w.fetch.on("GET", `${SGS}/bcdata.sgs.7478/dados`, { status: 500 });
    await w.connect(
      newBank(BANK_A, "BTG", [idle(BANK_A)], {
        investments: [cdb(1, BANK_A, { balance: 1100, amountWithdrawal: 1100, amountOriginal: 1000, rateType: "IPCA", fixedAnnualRate: 0, issueDate: ISSUE })],
      }),
    );
    mid(w, undefined, undefined, [["01/10/2026", "2.0"]]);
    await w.sync();
    expect(sgsCalls(w, 433)).toHaveLength(1);
    expect(sgsCalls(w, 7478)).toHaveLength(2);
  });
});
