import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { account, authResponse, investment, item, page, SYNTHETIC_CLIENT_ID, SYNTHETIC_CLIENT_SECRET } from "../testing/pluggyResponses";
import { createTestWorld } from "../testing/world";

const API = "https://api.pluggy.ai";
const CVM = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS";
const NEVER = new Promise<void>(() => {});
const BANK = "11111111-0000-0000-0000-000000000001";
const ACC = "22222222-0000-0000-0000-00000000000a";
const FUND = "55555555-0000-0000-0000-000000000001";
const FUND_CNPJ = "12.345.678/0001-95";
const OTHER_CNPJ = "98.765.432/0001-10";

const HEADER = "TP_FUNDO_CLASSE;CNPJ_FUNDO_CLASSE;ID_SUBCLASSE;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST";
const row = (cnpj: string, day: string, quota: number, sub = "") => `FI;${cnpj};${sub};${day};0;${quota};0;0;0;1`;
/** A monthly informe as the CVM ships it: a zip with a Latin-1 CSV, columns by name. */
const informe = (month: string, rows: string[], header = HEADER) =>
  zipSync({ [`inf_diario_fi_${month}.csv`]: strToU8(`${header}\n${rows.join("\n")}\n`) });

const MONTHS = ["202511", "202512", "202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608", "202609", "202610", "202611"];

async function world() {
  const w = await createTestWorld({ startAt: "2026-11-09T12:00:00.000Z" });
  w.fetch.on("POST", `${API}/auth`, { body: authResponse() });
  await w.core.saveCredentials({ clientId: SYNTHETIC_CLIENT_ID, clientSecret: SYNTHETIC_CLIENT_SECRET });
  const fund = {
    ...investment({ id: FUND, itemId: BANK, type: "MUTUAL_FUND", subtype: "MULTIMARKET_FUND", balance: 1100 } as never),
    amountWithdrawal: 1100,
    quantity: 100,
    value: 11,
    code: FUND_CNPJ,
  };
  w.fetch.on("GET", `${API}/accounts`, { body: page([account({ id: ACC, itemId: BANK, balance: 0 } as never)]) });
  w.fetch.on("GET", `${API}/investments`, { body: page([fund]) });
  w.fetch.on("GET", `${API}/investments/${FUND}/transactions`, { body: page([]) });
  w.fetch.on("GET", `${API}/identity`, { status: 404 });
  w.fetch.on("GET", `${API}/v2/transactions`, { body: { results: [], next: null } });
  w.fetch.on("GET", `${API}/bills`, { body: page([]) });
  w.fetch.on("GET", `${API}/items/${BANK}`, () => ({ body: item({ id: BANK, lastUpdatedAt: new Date(w.clock.now()).toISOString() }) }));
  w.fetch.on("GET", `${API}/items/${BANK}/resources`, { body: page([]) });
  const serve = (rowsOf: (month: string) => string[]) => {
    for (const m of MONTHS) w.fetch.on("GET", `${CVM}/inf_diario_fi_${m}.zip`, { body: informe(m, rowsOf(m)) });
  };
  const connect = async () => {
    await w.core.finishConnect(BANK, { tabClosed: NEVER });
    await w.core.readConnection(BANK);
  };
  const curve = async () =>
    Object.fromEntries((await w.core.netWorth()).curve.filter((p) => !p.today).map((p) => [p.month, p.total]));
  const cvmCalls = () => w.fetch.calls.filter((c) => c.url.startsWith(CVM));
  return { ...w, serve, connect, curve, cvmCalls };
}

/** Quota 10 up to October, 11 on the first-read day; other funds in the file are noise. */
const rowsOf = (month: string) => [
  row(OTHER_CNPJ, `${month.slice(0, 4)}-${month.slice(4)}-05`, 999),
  month === "202611" ? row(FUND_CNPJ, "2026-11-09", 11) : row(FUND_CNPJ, `${month.slice(0, 4)}-${month.slice(4)}-15`, 10),
];

describe("Cotas dos fundos", () => {
  it("casa a VL_QUOTA pelo CNPJ normalizado e estima o fundo pela cota, batendo com a primeira leitura", async () => {
    const w = await world();
    w.serve(rowsOf);
    await w.connect();

    const curve = await w.curve();

    expect(curve["2026-11"]).toBeUndefined();
    expect(curve["2026-10"]).toBeCloseTo(1000, 1); // 1100 * 10 / 11
    expect(curve["2026-03"]).toBeCloseTo(1000, 1);
  });

  it("lê as colunas pelo nome: o esquema antigo (CNPJ_FUNDO, sem subclasse) também casa", async () => {
    const w = await world();
    const old = "TP_FUNDO;CNPJ_FUNDO;DT_COMPTC;VL_TOTAL;VL_QUOTA;VL_PATRIM_LIQ;CAPTC_DIA;RESG_DIA;NR_COTST";
    for (const m of MONTHS) {
      const q = m === "202611" ? ["2026-11-09", 11] : [`${m.slice(0, 4)}-${m.slice(4)}-15`, 10];
      w.fetch.on("GET", `${CVM}/inf_diario_fi_${m}.zip`, { body: informe(m, [`FI;${FUND_CNPJ};${q[0]};0;${q[1]};0;0;0;1`], old) });
    }
    await w.connect();
    expect((await w.curve())["2026-10"]).toBeCloseTo(1000, 1);
  });

  it("o fundo com 2 ou mais subclasses fica na reta", async () => {
    const w = await world();
    w.serve((m) => [row(FUND_CNPJ, m === "202611" ? "2026-11-09" : `${m.slice(0, 4)}-${m.slice(4)}-15`, m === "202611" ? 11 : 10, "A"), row(FUND_CNPJ, `${m.slice(0, 4)}-${m.slice(4)}-16`, 50, "B")]);
    await w.connect();
    expect((await w.curve())["2026-10"]).toBeCloseTo(1100, 1);
  });

  it("o fundo que a CVM não tem fica na reta", async () => {
    const w = await world();
    w.serve((m) => [row(OTHER_CNPJ, `${m.slice(0, 4)}-${m.slice(4)}-15`, 3)]);
    await w.connect();
    expect((await w.curve())["2026-10"]).toBeCloseTo(1100, 1);
  });

  it("no 4G espera a licença: não baixa nada e pergunta; ao liberar, baixa e estima", async () => {
    const w = await world();
    w.serve(rowsOf);
    w.network.value = "cellular";
    await w.connect();

    expect(w.cvmCalls()).toHaveLength(0);
    expect(await w.core.fundQuotasPrompt()).toBe(true);
    expect((await w.curve())["2026-10"]).toBeUndefined(); // the estimate waits

    await w.core.answerFundQuotas("download");

    expect(await w.core.fundQuotasPrompt()).toBe(false);
    expect((await w.curve())["2026-10"]).toBeCloseTo(1000, 1);
  });

  it("'Esperar o Wi-Fi' guarda a escolha, não pergunta de novo e baixa quando o Wi-Fi volta", async () => {
    const w = await world();
    w.serve(rowsOf);
    w.network.value = "cellular";
    await w.connect();
    await w.core.answerFundQuotas("wait");

    expect(await w.core.fundQuotasPrompt()).toBe(false);
    expect(w.cvmCalls()).toHaveLength(0);
    expect(await w.restart().fundQuotasPrompt()).toBe(false); // kept in the database

    w.network.value = "wifi";
    await w.core.sync({ manual: true });
    expect((await w.curve())["2026-10"]).toBeCloseTo(1000, 1);
  });

  it("no Wi-Fi o download começa direto, sem perguntar", async () => {
    const w = await world();
    w.serve(rowsOf);
    await w.connect();
    expect(w.cvmCalls()).toHaveLength(13);
    expect(await w.core.fundQuotasPrompt()).toBe(false);
  });

  it("o download interrompido conta como fonte que falhou e é tentado de novo", async () => {
    const w = await world();
    w.serve(rowsOf);
    w.fetch.on("GET", `${CVM}/inf_diario_fi_202603.zip`, { body: informe("202603", rowsOf("202603")).subarray(0, 40) }); // cut short
    await w.connect();
    expect((await w.curve())["2026-10"]).toBeUndefined(); // pending
    expect(await w.core.diagnostic()).toContain("fonte que falhou CVM");

    w.fetch.on("GET", `${CVM}/inf_diario_fi_202603.zip`, { body: informe("202603", rowsOf("202603")) });
    await w.core.sync({ manual: true });
    expect((await w.curve())["2026-10"]).toBeCloseTo(1000, 1);
    expect(w.cvmCalls().filter((c) => c.url.endsWith("202601.zip"))).toHaveLength(1); // months already read are kept
  });
});
