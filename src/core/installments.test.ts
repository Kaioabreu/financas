import { describe, expect, it } from "vitest";
import {
  authResponse,
  bill,
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
const CARD = "22222222-0000-0000-0000-000000000002";
const NEVER = new Promise<void>(() => {});
const day = (d: string) => `${d}T12:00:00.000Z`;

let counter = 0;
const tid = () => `44444444-0000-0000-0000-${String(++counter).padStart(12, "0")}`;

/** One parcel as Pluggy sends it; `date` is whatever the bank put (bill date, purchase date...). */
function parcel(k: number, total: number, o: { purchase: string; amount: number; store?: string; date?: string; billId?: string; category?: string }) {
  return transaction({
    id: tid(),
    accountId: CARD,
    type: "DEBIT",
    amount: o.amount,
    description: o.store ?? "LOJA X",
    category: o.category ?? "Shopping",
    date: day(o.date ?? o.purchase),
    creditCardMetadata: {
      installmentNumber: k,
      totalInstallments: total,
      totalAmount: o.amount * total,
      purchaseDate: day(o.purchase),
      billId: o.billId ?? "b-open",
    },
  } as never);
}
const credit = (description: string, amount: number, date: string, billId = "b-open") =>
  transaction({
    id: tid(),
    accountId: CARD,
    type: "CREDIT",
    amount: -amount,
    description,
    category: null,
    categoryId: null,
    date: day(date),
    creditCardMetadata: { installmentNumber: 1, totalInstallments: 1, totalAmount: amount, purchaseDate: day(date), billId },
  } as never);
const plain = (description: string, amount: number, date: string) =>
  transaction({ id: tid(), accountId: CARD, type: "DEBIT", amount, description, date: day(date) } as never);

/** The clock starts on 2026-11-09. */
async function world(txs: object[], bills: object[] = []) {
  const w = await createTestWorld();
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  w.fetch.on("GET", `${API}/items/${ITEM_ID}`, () => ({ body: item() }));
  w.fetch.on("GET", `${API}/accounts`, { body: page([creditCard({ balance: 9999 } as never)]) });
  w.fetch.on("GET", `${API}/v2/transactions`, { body: { results: txs, next: null } });
  w.fetch.on("GET", `${API}/bills`, { body: page(bills) });
  w.fetch.on("GET", `${API}/investments`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { body: page([identity()]) });
  await w.core.finishConnect(ITEM_ID, { tabClosed: NEVER });
  await w.core.readConnection(ITEM_ID);
  const months = ["2026-01", "2026-02", "2026-03", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"];
  const all = async () => (await Promise.all(months.map((month) => w.core.listTransactions({ accountId: CARD, month })))).flat();
  return { ...w, all, find: async (description: string) => (await all()).filter((r) => r.description === description) };
}

describe("Parcelas: o dia em que contam", () => {
  it("compra de 31/01 em 3x conta em 31/01, 28/02 e 31/03, qualquer que seja o date do Pluggy", async () => {
    const w = await world([
      parcel(1, 3, { purchase: "2026-01-31", amount: 100, date: "2026-02-05" }),
      parcel(2, 3, { purchase: "2026-01-31", amount: 100, date: "2026-03-05" }),
      parcel(3, 3, { purchase: "2026-01-31", amount: 100, date: "2026-04-05" }),
    ]);
    const rows = (await w.all()).sort((a, b) => a.date.localeCompare(b.date));
    expect(rows.map((r) => r.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("o date do BTG (dia da compra) e o do Mercado Pago (dia da fatura) dão o mesmo dia", async () => {
    const w = await world([
      parcel(2, 3, { purchase: "2026-09-10", amount: 50, store: "BTG LOJA", date: "2026-10-10" }),
      parcel(2, 3, { purchase: "2026-09-10", amount: 50, store: "MP LOJA", date: "2026-10-25" }),
    ]);
    expect((await w.all()).map((r) => r.date)).toEqual(["2026-10-10", "2026-10-10"]);
  });

  it("sem os campos de parcela, vale o date", async () => {
    const w = await world([plain("PADARIA", 12, "2026-10-03")]);
    expect((await w.all()).map((r) => r.date)).toEqual(["2026-10-03"]);
  });

  it("mostra k de N e a data da compra, e a parcela futura só entra no resumo quando chegar", async () => {
    const w = await world([
      parcel(1, 2, { purchase: "2026-10-20", amount: 80 }),
      parcel(2, 2, { purchase: "2026-10-20", amount: 80 }),
    ]);
    const [second] = await w.core.listTransactions({ accountId: CARD, month: "2026-11" });
    expect(second).toMatchObject({ date: "2026-11-20", installment: { number: 2, total: 2 }, purchaseDate: "2026-10-20" });
    expect((await w.core.monthSummary("2026-10")).expenses).toBe(80);
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(0);
  });
});

describe("Parcelas: a compra parcelada", () => {
  it("editar uma parcela muda a compra inteira, inclusive as futuras", async () => {
    const w = await world([
      parcel(1, 3, { purchase: "2026-10-01", amount: 100 }),
      parcel(2, 3, { purchase: "2026-10-01", amount: 100 }),
      parcel(3, 3, { purchase: "2026-10-01", amount: 100 }),
    ]);
    const second = (await w.all()).find((r) => r.installment?.number === 2)!;
    await w.core.editTransaction(second.id, { nature: "expense", category: "leisure" });
    const rows = await w.all();
    expect(rows.map((r) => [r.category, r.source])).toEqual([
      ["leisure", "manual"],
      ["leisure", "manual"],
      ["leisure", "manual"],
    ]);
    expect((await w.core.monthSummary("2026-10")).categories).toEqual([{ category: "leisure", amount: 100 }]);
  });

  it("a 1ª parcela com centavos de diferença entra na compra; duas compras iguais se separam pelo valor", async () => {
    const w = await world([
      parcel(1, 3, { purchase: "2026-10-01", amount: 33.34, store: "LOJA A" }),
      parcel(2, 3, { purchase: "2026-10-01", amount: 33.33, store: "LOJA A" }),
      parcel(3, 3, { purchase: "2026-10-01", amount: 33.33, store: "LOJA A" }),
      parcel(1, 3, { purchase: "2026-10-01", amount: 90, store: "LOJA A" }),
      parcel(2, 3, { purchase: "2026-10-01", amount: 90, store: "LOJA A" }),
      parcel(3, 3, { purchase: "2026-10-01", amount: 90, store: "LOJA A" }),
    ]);
    const first = (await w.all()).find((r) => r.installment?.number === 1 && Math.abs(r.amount) === 33.34)!;
    await w.core.editTransaction(first.id, { nature: "expense", category: "health" });
    const rows = await w.all();
    const small = rows.filter((r) => Math.abs(r.amount) < 50);
    const big = rows.filter((r) => Math.abs(r.amount) > 50);
    expect(small).toHaveLength(3);
    expect(small.every((r) => r.category === "health")).toBe(true);
    expect(big).toHaveLength(3);
    expect(big.every((r) => r.category === "shopping")).toBe(true);
  });
});

describe("Parcela adiantada (BTG)", () => {
  const purchase = (extra: object[] = []) => [
    ...Array.from({ length: 10 }, (_, i) => parcel(i + 1, 10, { purchase: "2026-08-15", amount: 100 })),
    ...extra,
  ];

  it("a parcela conta no dia do desconto e o desconto é reembolso da mesma categoria", async () => {
    const w = await world(purchase([credit("Desconto na Parcela 8 de 10 LOJA X", 4, "2026-11-05")]));
    const eighth = (await w.all()).find((r) => r.installment?.number === 8)!;
    expect(eighth.date).toBe("2026-11-05");
    const discount = (await w.find("Desconto na Parcela 8 de 10 LOJA X"))[0]!;
    expect(discount).toMatchObject({ nature: "refund", category: "shopping", date: "2026-11-05" });
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(96);
  });

  it("sem par, o desconto é reembolso sem categoria", async () => {
    const w = await world(purchase([credit("Desconto na Parcela 8 de 10 OUTRA LOJA", 4, "2026-11-05")]));
    const discount = (await w.find("Desconto na Parcela 8 de 10 OUTRA LOJA"))[0]!;
    expect(discount.nature).toBe("refund");
    expect(discount.category).toBeUndefined();
    expect((await w.all()).find((r) => r.installment?.number === 8)!.date).toBe("2027-03-15");
  });
});

describe("Parcela cancelada (BTG)", () => {
  const six = () => Array.from({ length: 6 }, (_, i) => parcel(i + 1, 6, { purchase: "2026-08-15", amount: 50, store: "LOJA Y" }));

  it("com cobertura total, as parcelas futuras contam no dia do estorno e se anulam; as pagas ficam", async () => {
    const w = await world([
      ...six(),
      credit("Canc Parcela LOJA Y", 50, "2026-11-05"),
      credit("Canc Parcela LOJA Y", 50.2, "2026-11-05"),
      credit("Canc Parcela LOJA Y", 50, "2026-11-05"),
    ]);
    const parcels = (await w.find("LOJA Y")).sort((a, b) => a.installment!.number - b.installment!.number);
    expect(parcels.map((r) => r.date)).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-05", "2026-11-05", "2026-11-05"]);
    const credits = await w.find("Canc Parcela LOJA Y");
    expect(credits.every((r) => r.nature === "refund" && r.category === "shopping")).toBe(true);
    expect((await w.core.monthSummary("2026-11")).expenses).toBe(-0.2);
    expect((await w.core.monthSummary("2026-10")).expenses).toBe(50);
  });

  it("sem cobertura das parcelas futuras, nada se move e os créditos são reembolso sem categoria", async () => {
    const w = await world([...six(), credit("Canc Parcela LOJA Y", 50, "2026-11-05"), credit("Canc Parcela LOJA Y", 50, "2026-11-05")]);
    const parcels = (await w.find("LOJA Y")).sort((a, b) => a.installment!.number - b.installment!.number);
    expect(parcels.map((r) => r.date)).toEqual(["2026-08-15", "2026-09-15", "2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
    const credits = await w.find("Canc Parcela LOJA Y");
    expect(credits.every((r) => r.nature === "refund" && r.category === undefined)).toBe(true);
  });

  it("o cancelamento parcial de compra é só reembolso, sem mexer nas parcelas", async () => {
    const w = await world([...six(), credit("Cancelamento Parcial De Compra LOJA Y", 20, "2026-11-05")]);
    const partial = (await w.find("Cancelamento Parcial De Compra LOJA Y"))[0]!;
    expect(partial).toMatchObject({ nature: "refund", date: "2026-11-05" });
    expect(partial.category).toBeUndefined();
    expect((await w.find("LOJA Y")).map((r) => r.date).sort()).toEqual([
      "2026-08-15",
      "2026-09-15",
      "2026-10-15",
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
    ]);
  });
});

describe("Parcelas na dívida do Patrimônio", () => {
  const txs = () => [
    parcel(1, 3, { purchase: "2026-10-15", amount: 100, billId: "b-old" }),
    parcel(2, 3, { purchase: "2026-10-15", amount: 100, billId: "b-next" }),
    parcel(3, 3, { purchase: "2026-10-15", amount: 100, billId: "b-later" }),
    credit("Desconto na Parcela 3 de 3 LOJA X", 5, "2026-11-05", "b-cur"),
  ];
  const old = bill({ id: "b-old", totalAmount: 100, dueDate: "2026-10-05T00:00:00.000Z", payments: [{ amount: 100 }] } as never);

  it("a parcela entra no dia em que conta como gasto", async () => {
    const w = await world(txs(), [old, bill({ id: "b-cur", totalAmount: 95, dueDate: "2026-11-20T00:00:00.000Z", payments: [] } as never)]);
    expect((await w.core.netWorth()).debt).toBe(-95);
  });

  it("a adiantada sai com o pagamento da fatura em que entrou", async () => {
    const w = await world(txs(), [old, bill({ id: "b-cur", totalAmount: 95, dueDate: "2026-11-20T00:00:00.000Z", payments: [{ amount: 95 }] } as never)]);
    expect((await w.core.netWorth()).debt).toBe(0);
  });
});
