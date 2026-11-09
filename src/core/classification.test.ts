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
import type { EmbeddedConfig } from "./config";

const API = "https://api.pluggy.ai";
const ITEM_ID = "11111111-0000-0000-0000-000000000001";
const OTHER_ITEM = "11111111-0000-0000-0000-000000000002";
const BANK = "22222222-0000-0000-0000-000000000001";
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const USER_CPF = "52998224725"; // synthetic, valid check digits
const EMPLOYER = "11222333000181"; // synthetic CNPJ
const tid = (n: number) => `44444444-0000-0000-0000-${String(n).padStart(12, "0")}`;

let counter = 0;
const tx = (overrides: Record<string, unknown> = {}) =>
  transaction({ id: tid(++counter), date: "2026-10-20T12:00:00.000Z", ...overrides } as never);
const bankTx = (overrides: Record<string, unknown>) => tx({ accountId: BANK, ...overrides });
const cardTx = (overrides: Record<string, unknown>) => tx({ accountId: CARD, type: "DEBIT", amount: 80, ...overrides });
const party = (side: "payer" | "receiver", doc: string) => ({
  paymentData: { [side]: { documentNumber: { type: doc.length === 11 ? "CPF" : "CNPJ", value: doc } } },
});

async function world(options: { identity?: object[]; config?: Partial<EmbeddedConfig> } = {}) {
  const w = await createTestWorld({ config: options.config });
  const state = { bank: [] as object[], card: [] as object[], identity: options.identity ?? [identity({ document: USER_CPF })] };
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item() }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([account(), creditCard()]) });
  w.fetch.on("GET", `${API}/v2/transactions`, (call) => ({
    body: { results: call.url.includes(`accountId=${CARD}`) ? state.card : state.bank, next: null },
  }));
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, (call) => ({
    body: page(call.url.includes(OTHER_ITEM) ? [identity({ itemId: OTHER_ITEM, document: "11144477735" })] : state.identity),
  }));
  w.fetch.on("GET", `${API}/items/${OTHER_ITEM}`, () => ({ body: item({ id: OTHER_ITEM }) }));
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  const classified = async (core = w.core) => {
    const rows = [
      ...(await core.listTransactions({ accountId: BANK, month: "2026-10" })),
      ...(await core.listTransactions({ accountId: CARD, month: "2026-10" })),
    ];
    return Object.fromEntries(rows.map((r) => [r.description, r]));
  };
  return {
    ...w,
    classified,
    /** Loads the transactions and returns the classification of each, by description. */
    async read(bank: object[], card: object[] = []) {
      state.bank = bank;
      state.card = card;
      await w.core.readConnection(ITEM_ID);
      return classified();
    },
  };
}

describe("Classificação: sem sinal", () => {
  it("entrada de terceiro vira Receita em Outras receitas e saída para terceiro vira Gasto em Outros", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "ENTRADA", type: "CREDIT", amount: 100, category: null, categoryId: null }),
      bankTx({ description: "SAIDA", type: "DEBIT", amount: -30, category: null, categoryId: null }),
    ]);
    expect(rows.ENTRADA).toMatchObject({ nature: "income", origin: "other-income" });
    expect(rows.ENTRADA.category).toBeUndefined();
    expect(rows.SAIDA).toMatchObject({ nature: "expense", category: "other" });
    expect(rows.SAIDA.origin).toBeUndefined();
  });

  it("a categoria do Pluggy mapeada vale para o gasto, e a desconhecida cai em Outros", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "FEIRA", amount: -30, category: "Groceries" }),
      bankTx({ description: "ESQUISITO", amount: -30, category: "Coisa Nova" }),
    ]);
    expect(rows.FEIRA).toMatchObject({ nature: "expense", category: "groceries" });
    expect(rows.ESQUISITO).toMatchObject({ nature: "expense", category: "other" });
  });

  it("empréstimo pessoal nunca é deduzido", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "EMPRESTIMO", type: "CREDIT", amount: 500, category: "Loans and Financing", operationType: "OPERACAO_CREDITO" }),
    ]);
    expect(rows.EMPRESTIMO.nature).not.toBe("personal-loan");
  });
});

describe("Classificação: transferência própria", () => {
  it("contraparte com o CPF do usuário é transferência própria, mesmo com a outra conta fora do app", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "PIX SAIDA", amount: -200, operationType: "PIX", ...party("receiver", USER_CPF) }),
      bankTx({ description: "PIX ENTRADA", type: "CREDIT", amount: 200, operationType: "PIX", ...party("payer", USER_CPF) }),
      bankTx({ description: "PIX OUTRO", amount: -200, operationType: "PIX", ...party("receiver", "99999999999") }),
    ]);
    expect(rows["PIX SAIDA"].nature).toBe("own-transfer");
    expect(rows["PIX ENTRADA"].nature).toBe("own-transfer");
    expect(rows["PIX OUTRO"].nature).toBe("expense");
  });

  it("não é transferência própria o que as regras embutidas reconhecem como aporte", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "COMPRA - CDB SINTETICO", amount: -1000, ...party("receiver", USER_CPF) }),
    ]);
    expect(rows["COMPRA - CDB SINTETICO"].nature).toBe("investment");
  });
});

describe("Classificação: pagamento de fatura", () => {
  it("no cartão, o pagamento por categoria ou operationType; na conta, a saída de mesmo valor em até 3 dias", async () => {
    const w = await world();
    const rows = await w.read(
      [
        bankTx({ description: "CONTA PAGA FATURA", amount: -500, date: "2026-10-22T12:00:00.000Z" }),
        bankTx({ description: "CONTA LONGE", amount: -500, date: "2026-10-27T12:00:00.000Z" }),
      ],
      [
        cardTx({ description: "PAGAMENTO CATEGORIA", type: "CREDIT", amount: -500, category: "Credit card payment", date: "2026-10-20T12:00:00.000Z" }),
        cardTx({ description: "PAGAMENTO TIPO", type: "CREDIT", amount: -70, operationType: "PAGAMENTO_FATURA", category: null }),
      ],
    );
    expect(rows["PAGAMENTO CATEGORIA"].nature).toBe("bill-payment");
    expect(rows["PAGAMENTO TIPO"].nature).toBe("bill-payment");
    expect(rows["CONTA PAGA FATURA"].nature).toBe("bill-payment");
    expect(rows["CONTA LONGE"].nature).toBe("expense");
  });

  it("um pagamento da fatura só casa com uma saída da conta", async () => {
    const w = await world();
    const rows = await w.read(
      [
        bankTx({ description: "SAIDA A", amount: -500, date: "2026-10-20T12:00:00.000Z" }),
        bankTx({ description: "SAIDA B", amount: -500, date: "2026-10-21T12:00:00.000Z" }),
      ],
      [cardTx({ description: "PAG", type: "CREDIT", amount: -500, operationType: "PAGAMENTO_FATURA", date: "2026-10-20T12:00:00.000Z" })],
    );
    expect(rows["SAIDA A"].nature).toBe("bill-payment");
    expect(rows["SAIDA B"].nature).toBe("expense");
  });

  it("pagar a fatura de um cartão que não está no app é Gasto em Outros", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "FATURA DE FORA", amount: -321, category: "Credit card payment", operationType: "BOLETO" }),
    ]);
    expect(rows["FATURA DE FORA"]).toMatchObject({ nature: "expense", category: "other" });
  });
});

describe("Classificação: salário", () => {
  const paycheck = [identity({ document: USER_CPF, paychecksBankLink: [{ employerDocument: EMPLOYER }] })];

  it("transferência cujo pagador é o empregador é Salário; o documento sozinho não basta", async () => {
    const w = await world({ identity: paycheck });
    const rows = await w.read([
      bankTx({ description: "PAGTO EMPREGADOR", type: "CREDIT", amount: 5000, operationType: "InternalTransfer", ...party("payer", EMPLOYER) }),
      bankTx({ description: "BOLETO EMPREGADOR", type: "CREDIT", amount: 90, operationType: "BOLETO", ...party("payer", EMPLOYER) }),
    ]);
    expect(rows["PAGTO EMPREGADOR"]).toMatchObject({ nature: "income", origin: "salary" });
    expect(rows["BOLETO EMPREGADOR"]).toMatchObject({ nature: "income", origin: "other-income" });
  });

  it("FOLHA_PAGAMENTO e Income > Salary também são Salário", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "FOLHA", type: "CREDIT", amount: 3000, operationType: "FOLHA_PAGAMENTO" }),
      bankTx({ description: "CATEGORIA SALARIO", type: "CREDIT", amount: 2000, category: "Salary" }),
    ]);
    expect(rows.FOLHA.origin).toBe("salary");
    expect(rows["CATEGORIA SALARIO"].origin).toBe("salary");
  });
});

describe("Classificação: reembolso", () => {
  it("estorno e cashback no cartão são Reembolso, com a categoria do Pluggy quando houver", async () => {
    const w = await world();
    const rows = await w.read(
      [],
      [
        cardTx({ description: "ESTORNO LOJA", type: "CREDIT", amount: -40, operationType: "ESTORNO", category: "Shopping" }),
        cardTx({ description: "CASHBACK", type: "CREDIT", amount: -2, operationType: "CASHBACK", category: null }),
      ],
    );
    expect(rows["ESTORNO LOJA"]).toMatchObject({ nature: "refund", category: "shopping" });
    expect(rows.CASHBACK).toMatchObject({ nature: "refund" });
    expect(rows.CASHBACK.category).toBeUndefined();
  });
});

describe("Classificação: regras embutidas", () => {
  it("cada regra embutida dá a natureza, a categoria e a origem previstas", async () => {
    const w = await world();
    const b = (description: string, amount: number, extra: Record<string, unknown> = {}) =>
      bankTx({ description, amount, type: amount > 0 ? "CREDIT" : "DEBIT", category: "Shopping", ...extra });
    const rows = await w.read([
      b("CONTA REMUNERADA - APLICACAO AUTOMATICA", -50),
      b("Compra de Tesouro Selic 2029", -300),
      b("COMPRA - CDB BANCO X", -300),
      b("EMISSAO - CDB BANCO X", -300),
      b("Venda de Tesouro Direto", 300),
      b("LIQ BOLSA - VISTA BRUTO", -100),
      b("LIQ BOLSA - VISTA BRUTO ", 100, { id: tid(900) }),
      b("LIQ BOLSA - VISTA TX 1", -1),
      b("TAXA SOBRE VALOR EM CUSTÓDIA", -2),
      b("IR - BTC", -3),
      b("CUPOM - CRA XYZ", 8),
      b("TAXA REMUNERAÇÃO - BTC", 4),
      b("Rendimentos", 2, { operationType: "RESGATE_APLIC_FINANCEIRA" }),
      b("Cofrinho", -20, { operationType: "TRANSFERENCIA_SALDO_RESERVADO" }),
      b("Cofrinho volta", 20, { operationType: "TRANSFERENCIA_SALDO_RESERVADO" }),
      b("JCP ACME", 5),
      b("Dividendos ACME", 6),
      b("Rendimento FII XPTO11", 7),
      b("IOF DE COMPRA INTERNACIONAL", -1.5),
      b("Desconto na Parcela 2 de 10 Loja", 9),
      b("Canc Parcela Loja", 9, { id: tid(901) }),
    ]);
    expect(rows["CONTA REMUNERADA - APLICACAO AUTOMATICA"].nature).toBe("own-transfer");
    for (const d of ["Compra de Tesouro Selic 2029", "COMPRA - CDB BANCO X", "EMISSAO - CDB BANCO X"]) expect(rows[d].nature).toBe("investment");
    expect(rows["Venda de Tesouro Direto"].nature).toBe("withdrawal");
    expect(rows["LIQ BOLSA - VISTA BRUTO"].nature).toBe("investment");
    expect(rows["LIQ BOLSA - VISTA BRUTO "].nature).toBe("withdrawal");
    for (const d of ["LIQ BOLSA - VISTA TX 1", "TAXA SOBRE VALOR EM CUSTÓDIA", "IR - BTC", "IOF DE COMPRA INTERNACIONAL"]) {
      expect(rows[d]).toMatchObject({ nature: "expense", category: "fees-taxes" });
    }
    for (const d of ["CUPOM - CRA XYZ", "TAXA REMUNERAÇÃO - BTC", "Rendimentos", "JCP ACME", "Dividendos ACME", "Rendimento FII XPTO11"]) {
      expect(rows[d]).toMatchObject({ nature: "income", origin: "yield" });
    }
    expect(rows.Cofrinho.nature).toBe("investment");
    expect(rows["Cofrinho volta"].nature).toBe("withdrawal");
    expect(rows["Desconto na Parcela 2 de 10 Loja"].nature).toBe("refund");
    expect(rows["Canc Parcela Loja"].nature).toBe("refund");
  });

  it("a regra embutida vence o sinal e a categoria do Pluggy", async () => {
    const w = await world();
    const rows = await w.read([
      bankTx({ description: "IR - BTC", amount: -9, category: "Groceries", ...party("receiver", USER_CPF) }),
    ]);
    expect(rows["IR - BTC"]).toMatchObject({ nature: "expense", category: "fees-taxes" });
  });

  it("a regra casa sem diferenciar maiúsculas nem acentos", async () => {
    const w = await world();
    const rows = await w.read([bankTx({ description: "taxa sobre valor em custodia", amount: -2 })]);
    expect(rows["taxa sobre valor em custodia"].category).toBe("fees-taxes");
  });
});

describe("Classificação: reclassificação", () => {
  it("mudar a configuração embutida reclassifica tudo sem ler o Pluggy de novo", async () => {
    const w = await world();
    const rows = await w.read([bankTx({ description: "LOJA NOVA XYZ", amount: -10, category: "Shopping" })]);
    expect(rows["LOJA NOVA XYZ"]).toMatchObject({ nature: "expense", category: "shopping" });
    const reads = w.fetch.calls.length;

    const updated = w.restart({
      builtInRules: [{ contains: "loja nova", nature: "expense", category: "leisure" }],
    });

    expect((await w.classified(updated))["LOJA NOVA XYZ"]).toMatchObject({ nature: "expense", category: "leisure" });
    expect(w.fetch.calls.length).toBe(reads);
  });
});

describe("CPF", () => {
  it("vem do /identity quando uma Conexão o traz", async () => {
    const w = await world();
    await w.read([]);
    expect(await w.core.cpfStatus()).toEqual({ state: "known", cpf: USER_CPF, source: "identity" });
  });

  it("é pedido à mão quando nenhuma Conexão o traz, e a transferência própria passa a valer", async () => {
    const w = await world({ identity: [identity({ document: null, documentType: null })] });
    const tr = bankTx({ description: "PIX PARA MIM", amount: -5, ...party("receiver", USER_CPF) });
    expect((await w.read([tr]))["PIX PARA MIM"].nature).toBe("expense");
    expect(await w.core.cpfStatus()).toEqual({ state: "needed", reason: "missing" });

    expect(await w.core.setCpf("529.982.247-25")).toEqual({ ok: true });

    expect((await w.classified())["PIX PARA MIM"].nature).toBe("own-transfer");
    expect(await w.core.cpfStatus()).toEqual({ state: "known", cpf: USER_CPF, source: "manual" });
  });

  it("é pedido à mão quando as Conexões discordam", async () => {
    const w = await world();
    await w.read([]);
    await w.core.finishConnect(OTHER_ITEM, { tabClosed: NEVER });
    await w.core.readConnection(OTHER_ITEM);
    expect(await w.core.cpfStatus()).toEqual({ state: "needed", reason: "conflict" });
  });

  it("recusa um CPF inválido", async () => {
    const w = await world();
    const result = await w.core.setCpf("123.456.789-00");
    expect(result.ok).toBe(false);
  });
});

describe("Classificação: o valor", () => {
  it("compra em moeda estrangeira usa o valor em reais", async () => {
    const w = await world();
    const rows = await w.read([bankTx({ description: "DOLAR", amount: -10, amountInAccountCurrency: -55, currencyCode: "USD" })]);
    expect(rows.DOLAR.amount).toBe(-55);
  });
});
