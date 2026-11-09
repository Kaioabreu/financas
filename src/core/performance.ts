// Core: the Rentabilidade da carteira, month and year, next to the CDI.
// Valorização = how much the carteira varied (end minus start) without the aportes and resgates.
// Rentabilidade = (valorização + proventos e juros paid) / what was invested at the start.
// The values come from the Retratos; a period touching an estimated Retrato is marked estimated.
import { eq } from "drizzle-orm";
import { appMeta, snapshot } from "../db/schema";
import type { CoreDatabase } from "./createCore";
import { localDay, type Line } from "./networth";
import type { MonthSummary } from "./summary";

const SGS_BASE = "https://api.bcb.gov.br/dados/serie";
/** SGS 4391: CDI accumulated in the month, in percent. */
const CDI_MONTHLY = 4391;
const CACHE_KEY = `cache.sgs.${CDI_MONTHLY}`;
const CACHE_FRESH_MS = 12 * 3_600_000;

export interface PerformancePeriod {
  /** Fraction (0.05 = 5%); null when there is no start value to compare with. */
  rentability: number | null;
  /** The CDI of the period, as a fraction; null when the series is not available. */
  cdi: number | null;
  /** Part of the period comes from an estimated Retrato. */
  estimated: boolean;
}
export interface MonthPerformance extends PerformancePeriod {
  /** YYYY-MM. */
  month: string;
  /** Aportes minus resgates. */
  netContribution: number;
  /** Variation of the carteira without aportes and resgates; null without a start or end value. */
  appreciation: number | null;
  /** Proventos e juros the carteira paid in the month. */
  proceeds: number;
}
export interface PerformanceView {
  month: MonthPerformance;
  /** Since January of the month's year. */
  year: PerformancePeriod;
}
export interface PerformanceApi {
  performance(month?: string): Promise<PerformanceView>;
}

interface Deps {
  db: CoreDatabase;
  fetch: typeof fetch;
  clock: () => number;
  monthSummary: (month: string) => Promise<MonthSummary>;
  /** What the carteira is worth today (live). */
  portfolioNow: () => Promise<number>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const parse = (text: string | null): any => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};
const lastDay = (month: string) => `${month}-${String(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
const previousMonth = (month: string) => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export function createPerformance(deps: Deps): PerformanceApi {
  const { db } = deps;

  async function cdiSeries(year: string): Promise<Map<string, number> | null> {
    const row = (await db.select().from(appMeta).where(eq(appMeta.key, CACHE_KEY)))[0]?.value ?? null;
    const cached = parse(row);
    const cachedValues: Map<string, number> | null = Array.isArray(cached.values) ? new Map(cached.values) : null;
    const now = deps.clock();
    if (cachedValues && cached.year === year && typeof cached.at === "number" && now - cached.at < CACHE_FRESH_MS) return cachedValues;
    try {
      const response = await deps.fetch(`${SGS_BASE}/bcdata.sgs.${CDI_MONTHLY}/dados?formato=json&dataInicial=01/01/${year}&dataFinal=31/12/${year}`);
      if (response.status !== 200) throw new Error("sgs");
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("sgs");
      const values = new Map<string, number>();
      for (const r of rows as { data?: unknown; valor?: unknown }[]) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(typeof r?.data === "string" ? r.data : "");
        const v = Number(String(r?.valor ?? "").replace(",", "."));
        if (m && Number.isFinite(v)) values.set(`${m[3]}-${m[2]}`, v);
      }
      const value = JSON.stringify({ year, at: now, values: [...values] });
      await db.insert(appMeta).values({ key: CACHE_KEY, value }).onConflictDoUpdate({ target: appMeta.key, set: { value } });
      return values;
    } catch {
      return cached.year === year ? cachedValues : null; // offline: the last answer, if it is of this year
    }
  }

  async function snapshots() {
    return (await db.select().from(snapshot)).map((r) => ({ date: r.date, itemId: r.itemId, ...(parse(r.payload) as { lines?: Line[]; estimated?: boolean }) }));
  }
  type Snap = Awaited<ReturnType<typeof snapshots>>[number];

  /** The carteira (no caixa, no debt) as the last Retrato of each Connection up to `date` tells it. */
  function portfolioAt(snaps: Snap[], date: string): { value: number; estimated: boolean } | null {
    const latest = new Map<string, Snap>();
    for (const s of snaps) {
      if (s.date > date) continue;
      const cur = latest.get(s.itemId);
      if (!cur || s.date > cur.date) latest.set(s.itemId, s);
    }
    if (latest.size === 0) return null;
    let value = 0;
    let estimated = false;
    for (const s of latest.values()) {
      estimated ||= s.estimated === true;
      for (const l of s.lines ?? []) if (l.cls !== "cash" && l.cls !== "debt") value += l.value;
    }
    return { value, estimated };
  }

  async function monthOf(month: string, snaps: Snap[], today: string): Promise<Omit<MonthPerformance, "cdi">> {
    const summary = await deps.monthSummary(month);
    const proceeds = summary.income.byOrigin.yield;
    const net = summary.netContribution;
    const start = portfolioAt(snaps, lastDay(previousMonth(month)));
    let end: { value: number; estimated: boolean } | null;
    if (month > today.slice(0, 7)) end = null;
    else if (month === today.slice(0, 7)) end = { value: await deps.portfolioNow(), estimated: false };
    else end = portfolioAt(snaps, lastDay(month));
    const estimated = (start?.estimated ?? false) || (end?.estimated ?? false);
    const appreciation = start && end ? round2(end.value - start.value - net) : null;
    const rentability = appreciation !== null && start!.value > 0 ? (appreciation + proceeds) / start!.value : null;
    return { month, netContribution: net, appreciation, proceeds: round2(proceeds), rentability, estimated };
  }

  return {
    async performance(month) {
      const today = localDay(deps.clock());
      const target = month ?? today.slice(0, 7);
      const year = target.slice(0, 4);
      const snaps = await snapshots();
      const series = await cdiSeries(year);

      const cdiOf = (months: string[]) => {
        const rates = months.map((m) => series?.get(m)).filter((v): v is number => v !== undefined);
        return rates.length ? rates.reduce((acc, v) => acc * (1 + v / 100), 1) - 1 : null;
      };

      const current = await monthOf(target, snaps, today);
      const months = Array.from({ length: Number(target.slice(5, 7)) }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
      let growth = 1;
      let any = false;
      let estimated = false;
      for (const m of months) {
        const p = m === target ? current : await monthOf(m, snaps, today);
        if (p.rentability === null) continue;
        any = true;
        growth *= 1 + p.rentability;
        estimated ||= p.estimated;
      }

      return {
        month: { ...current, cdi: cdiOf([target]) },
        year: { rentability: any ? growth - 1 : null, cdi: cdiOf(months), estimated },
      };
    },
  };
}
