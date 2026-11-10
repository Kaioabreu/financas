// Core: the daily quota of the funds, from the CVM "informe diário", for the estimate of the past.
// One zip per month (~11 MB; ~135 MB for the 12 months), so it only downloads on Wi-Fi or after the
// user allows it on mobile data. The zip is read as a stream, columns by name, and only the rows of
// the funds in the portfolio are kept. A fund not found, or with 2+ subclasses, stays on the straight line.
import { eq } from "drizzle-orm";
import { Unzip, UnzipInflate } from "fflate";
import { appMeta } from "../db/schema";
import type { CoreDatabase } from "./createCore";

export const CVM_BASE = "https://dados.cvm.gov.br/dados/FI/DOC/INF_DIARIO/DADOS";
const CHOICE_KEY = "fundQuotas.cellular";

export type NetworkKind = "wifi" | "cellular" | "offline";
export type CellularChoice = "download" | "wait";

/** The CVM source could not be read now: `waiting` is true when it only waits for the user's licence. */
export class QuotaSourceError extends Error {
  constructor(
    readonly source: string,
    readonly waiting = false,
  ) {
    super(source);
  }
}

/** Only the punctuation goes; letters stay (the alphanumeric CNPJ). */
export function normalizeCnpj(raw: unknown): string | null {
  const text = typeof raw === "string" ? raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : "";
  return /^[0-9A-Z]{12}[0-9]{2}$/.test(text) ? text : null;
}

export interface QuotaRow {
  cnpj: string;
  sub: string;
  day: string;
  quota: number;
}

/** Reads the CSV lines of a stream of chunks (Latin-1; the columns that matter are ASCII) by header name. */
function csvReader(wanted: Set<string>) {
  const rows: QuotaRow[] = [];
  let tail = "";
  let cols: { cnpj: number; sub: number; day: number; quota: number } | null = null;
  const handle = (line: string) => {
    if (!line) return;
    const f = line.replace(/\r$/, "").split(";");
    if (!cols) {
      const at = (...names: string[]) => names.map((n) => f.indexOf(n)).find((i) => i >= 0) ?? -1;
      cols = { cnpj: at("CNPJ_FUNDO_CLASSE", "CNPJ_FUNDO"), sub: at("ID_SUBCLASSE"), day: at("DT_COMPTC"), quota: at("VL_QUOTA") };
      if (cols.cnpj < 0 || cols.day < 0 || cols.quota < 0) throw new QuotaSourceError("CVM");
      return;
    }
    const cnpj = normalizeCnpj(f[cols.cnpj]);
    if (!cnpj || !wanted.has(cnpj)) return;
    const quota = Number(f[cols.quota]);
    const day = f[cols.day] ?? "";
    if (Number.isFinite(quota) && quota > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day)) rows.push({ cnpj, sub: cols.sub >= 0 ? (f[cols.sub] ?? "").trim() : "", day, quota });
  };
  return {
    rows,
    push(chunk: Uint8Array, final: boolean) {
      let text = tail;
      for (let i = 0; i < chunk.length; i += 8192) text += String.fromCharCode.apply(null, chunk.subarray(i, i + 8192) as unknown as number[]);
      const lines = text.split("\n");
      tail = lines.pop() ?? "";
      for (const line of lines) handle(line);
      if (final) {
        handle(tail);
        tail = "";
      }
    },
  };
}

/** Streams one monthly zip and keeps the rows of the wanted CNPJs. Throws QuotaSourceError when unreadable. */
export function readInformeZip(zip: Uint8Array, wanted: Set<string>): QuotaRow[] {
  const reader = csvReader(wanted);
  let sawCsv = false;
  try {
    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (file) => {
      if (!file.name.toLowerCase().endsWith(".csv") || sawCsv) return;
      sawCsv = true;
      file.ondata = (error, chunk, final) => {
        if (error) throw error;
        reader.push(chunk, final);
      };
      file.start();
    };
    for (let i = 0; i < zip.length; i += 65_536) unzip.push(zip.subarray(i, i + 65_536), i + 65_536 >= zip.length);
  } catch {
    throw new QuotaSourceError("CVM");
  }
  if (!sawCsv) throw new QuotaSourceError("CVM");
  return reader.rows;
}

export interface FundQuotas {
  /** Quota by day, per CNPJ; a fund with 2+ subclasses or no rows is absent (it stays on the straight line). */
  byCnpj: Map<string, Map<string, number>>;
}

interface Deps {
  db: CoreDatabase;
  fetch: typeof fetch;
  network?: () => Promise<NetworkKind>;
}

export function createFundQuotas(deps: Deps) {
  const { db } = deps;
  const readMeta = async (key: string) => (await db.select().from(appMeta).where(eq(appMeta.key, key)))[0]?.value ?? null;
  const writeMeta = (key: string, value: string) => db.insert(appMeta).values({ key, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });

  const choice = async (): Promise<CellularChoice | null> => {
    const v = await readMeta(CHOICE_KEY);
    return v === "download" || v === "wait" ? v : null;
  };

  /** The rows of one month for these CNPJs: from the cache, or downloaded (and cached for the next attempt). */
  async function month(m: string, cnpjs: string[]): Promise<QuotaRow[]> {
    const key = `cache.cvm.${m}`;
    let cached: { cnpjs?: string[]; rows?: QuotaRow[] } = {};
    try {
      cached = JSON.parse((await readMeta(key)) ?? "{}");
    } catch {
      /* no usable cache */
    }
    if (cached.cnpjs && cached.rows && cnpjs.every((c) => cached.cnpjs!.includes(c))) return cached.rows;

    const net = await (deps.network?.() ?? Promise.resolve<NetworkKind>("wifi"));
    if (net === "offline") throw new QuotaSourceError("CVM");
    if (net === "cellular" && (await choice()) !== "download") throw new QuotaSourceError("CVM", true);
    let bytes: Uint8Array;
    try {
      const response = await deps.fetch(`${CVM_BASE}/inf_diario_fi_${m}.zip`);
      if (response.status !== 200) throw new QuotaSourceError("CVM");
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new QuotaSourceError("CVM"); // an interrupted download is a failed source
    }
    const rows = readInformeZip(bytes, new Set(cnpjs));
    await writeMeta(key, JSON.stringify({ cnpjs, rows }));
    return rows;
  }

  /** Quotas of the CNPJs for the months of [from, to] (YYYY-MM-DD). Throws QuotaSourceError. */
  async function load(cnpjs: string[], from: string, to: string): Promise<FundQuotas> {
    const byCnpj = new Map<string, Map<string, number>>();
    if (!cnpjs.length) return { byCnpj };
    const subs = new Map<string, Set<string>>();
    const days = new Map<string, Map<string, number>>();
    const last = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
    for (let n = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7)); n <= last; n++) {
      const y = Math.floor((n - 1) / 12);
      const m = ((n - 1) % 12) + 1;
      for (const r of await month(`${y}${String(m).padStart(2, "0")}`, cnpjs)) {
        if (!subs.has(r.cnpj)) subs.set(r.cnpj, new Set());
        if (!days.has(r.cnpj)) days.set(r.cnpj, new Map());
        subs.get(r.cnpj)!.add(r.sub);
        days.get(r.cnpj)!.set(r.day, r.quota);
      }
    }
    for (const [cnpj, perDay] of days) if ((subs.get(cnpj)?.size ?? 0) < 2) byCnpj.set(cnpj, perDay);
    return { byCnpj };
  }

  return { load, choice, setChoice: (c: CellularChoice) => writeMeta(CHOICE_KEY, c) };
}

/**
 * Value of a fund day by day: the quota (carried over weekends, held before the first one) times the
 * quantity, calibrated so the last day meets the position of the first read. Null when there is no quota.
 */
export function quotaPath(
  quotas: Map<string, number>,
  target: number,
  position: { qtyNow: number; ops: { date: string; qty: number }[]; start: string | null },
  D: string,
  days: string[],
): Record<string, number> | null {
  const list = [...quotas].sort(([a], [b]) => a.localeCompare(b));
  if (!list.length || !(target > 0)) return null;
  const quotaAt = (day: string) => {
    let q = list[0]![1];
    for (const [d, v] of list) {
      if (d > day) break;
      q = v;
    }
    return q;
  };
  const qtyAt = (day: string) => Math.max(0, position.qtyNow - position.ops.filter((o) => o.date > day).reduce((s, o) => s + o.qty, 0));
  const atD = qtyAt(D) * quotaAt(D);
  if (!(atD > 0)) return null;
  const k = target / atD;
  const out: Record<string, number> = {};
  for (const day of days) {
    const existed = position.ops.length > 0 || !position.start || day >= position.start;
    out[day] = existed ? qtyAt(day) * quotaAt(day) * k : 0;
  }
  return out;
}
