// Core: Compras parceladas. From the stored card transactions it works out, for each one, the day
// it counts (the Parcela k counts on the purchase day, k - 1 months later), the purchase it belongs
// to, and the BTG embedded cases: a Parcela adiantada counts on the day of its discount and a
// Parcela cancelada on the day of the refund. A pure function of what is stored, recomputed on
// every read, so nothing here is saved and a late credit simply moves the parcel.
import { account, bankTransaction } from "../db/schema";
import type { CoreDatabase } from "./createCore";

/** How far, as a share of the parcel, a value may differ and still be the same purchase. */
export const INSTALLMENT_TOLERANCE = 0.01;

export interface InstallmentInfo {
  number: number;
  total: number;
  /** YYYY-MM-DD */
  purchaseDate: string;
  /** Identifies the purchase: edits attach to it. */
  groupKey: string;
}

export interface PlanEntry {
  /** YYYY-MM-DD: the day it counts. */
  date: string;
  installment?: InstallmentInfo;
  /** A credit that settled a purchase's parcels (adiantada or cancelada): the purchase's group. */
  creditOf?: string;
  /** The bill the transaction counts in, when it is not the one Pluggy says (moved parcels). */
  billId?: string;
}

export interface InstallmentPlan {
  byId: Map<string, PlanEntry>;
  /** Parcel ids of each purchase, by number. */
  groups: Map<string, string[]>;
  /** The day a transaction counts: the plan's, or Pluggy's own date. */
  dateOf(id: string, rawDate: string): string;
}

interface Parcel {
  id: string;
  accountId: string;
  number: number;
  total: number;
  purchase: string;
  store: string;
  cents: number;
  natural: string;
  groupKey: string;
  date: string;
  billId?: string;
}
interface CardCredit {
  id: string;
  accountId: string;
  date: string;
  text: string;
  amount: number;
  billId: string | undefined;
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const storeOf = (text: string) =>
  normalize(text)
    .replace(/\s*-?\s*parcela\s*\d+\s*(\/|de)\s*\d+\s*$/, "")
    .trim();
const cents = (v: number) => Math.round(Math.abs(v) * 100);

function addMonths(isoDay: string, months: number): string {
  const [y, m, d] = isoDay.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const within = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, Math.round(b * INSTALLMENT_TOLERANCE));

function metadata(extra: string | null): any {
  try {
    return extra ? (JSON.parse(extra).creditCardMetadata ?? null) : null;
  } catch {
    return null;
  }
}

export async function buildInstallmentPlan(db: CoreDatabase): Promise<InstallmentPlan> {
  const cards = new Set((await db.select().from(account)).filter((a) => a.type === "CREDIT").map((a) => a.id));
  const rows = (await db.select().from(bankTransaction)).filter((t) => cards.has(t.accountId));

  const parcels: Parcel[] = [];
  const credits: CardCredit[] = [];
  for (const t of rows) {
    const amount = t.amountInAccountCurrency ?? t.amount;
    const isCredit = t.type ? t.type === "CREDIT" : amount < 0;
    const meta = metadata(t.extra);
    if (isCredit) {
      credits.push({ id: t.id, accountId: t.accountId, date: t.date.slice(0, 10), text: normalize(t.description), amount: cents(amount), billId: meta?.billId });
      continue;
    }
    const number = meta?.installmentNumber;
    const total = meta?.totalInstallments;
    const purchase = typeof meta?.purchaseDate === "string" ? meta.purchaseDate.slice(0, 10) : "";
    if (!Number.isInteger(number) || !Number.isInteger(total) || total < 2 || number < 1 || number > total || !/^\d{4}-\d{2}-\d{2}$/.test(purchase)) continue;
    parcels.push({
      id: t.id,
      accountId: t.accountId,
      number,
      total,
      purchase,
      store: storeOf(t.description),
      cents: cents(amount),
      natural: addMonths(purchase, number - 1),
      groupKey: "",
      date: addMonths(purchase, number - 1),
      billId: meta?.billId,
    });
  }

  // Purchase: card + purchase day + total + store; then split by the value of parcels 2..N;
  // the 1st parcel joins the closest value within the tolerance.
  const buckets = new Map<string, Parcel[]>();
  for (const p of parcels) {
    const key = `${p.accountId}|${p.purchase}|${p.total}|${p.store}`;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  for (const [key, list] of buckets) {
    const clusters = new Map<number, Parcel[]>();
    for (const p of list.filter((x) => x.number >= 2)) clusters.set(p.cents, [...(clusters.get(p.cents) ?? []), p]);
    const withFirst = new Set<number>();
    for (const first of list.filter((x) => x.number === 1).sort((a, b) => a.cents - b.cents)) {
      let best: number | null = null;
      for (const value of clusters.keys()) {
        if (withFirst.has(value) || !within(first.cents, value)) continue;
        if (best === null || Math.abs(value - first.cents) < Math.abs(best - first.cents)) best = value;
      }
      if (best === null) clusters.set(first.cents, [...(clusters.get(first.cents) ?? []), first]);
      else {
        withFirst.add(best);
        clusters.get(best)!.push(first);
      }
    }
    for (const [value, members] of clusters) for (const p of members) p.groupKey = `${key}|${value}`;
  }

  const groups = new Map<string, Parcel[]>();
  for (const p of parcels) groups.set(p.groupKey, [...(groups.get(p.groupKey) ?? []), p]);
  const moved = new Map<string, { date: string; billId: string | undefined; credit: CardCredit }>();
  const creditOf = new Map<string, string>();
  const byDate = (a: CardCredit, b: CardCredit) => a.date.localeCompare(b.date);

  // Parcela adiantada: "Desconto na Parcela N de M <loja>".
  const sorted = [...credits].sort(byDate);
  for (const c of sorted) {
    const m = /^desconto na parcela (\d+) de (\d+)\s+(.+)$/.exec(c.text);
    if (!m) continue;
    const [, n, total, store] = m;
    const target = parcels
      .filter((p) => p.accountId === c.accountId && p.number === Number(n) && p.total === Number(total) && p.store === storeOf(store!) && !moved.has(p.id))
      .sort((a, b) => a.purchase.localeCompare(b.purchase))[0];
    if (!target) continue;
    moved.set(target.id, { date: c.date, billId: c.billId, credit: c });
    creditOf.set(c.id, target.groupKey);
  }

  // Parcela cancelada: "Canc Parcela <loja>", only when the credits cover every future parcel.
  const claimed = new Set(creditOf.keys());
  const groupList = [...groups.entries()].sort(([, a], [, b]) => a[0]!.purchase.localeCompare(b[0]!.purchase));
  for (const [groupKey, members] of groupList) {
    const sample = members[0]!;
    const value = members.find((p) => p.number >= 2)?.cents ?? sample.cents;
    const matching = sorted.filter((c) => {
      if (claimed.has(c.id) || c.accountId !== sample.accountId) return false;
      const m = /^canc parcela\s*-?\s*(.*)$/.exec(c.text);
      return m !== null && storeOf(m[1]!) === sample.store && within(c.amount, value);
    });
    if (matching.length === 0) continue;
    const limit = matching[0]!.date;
    const future = members.filter((p) => !moved.has(p.id) && p.natural > limit).sort((a, b) => a.number - b.number);
    if (future.length === 0 || matching.length < future.length) continue;
    future.forEach((p, i) => {
      const c = matching[i]!;
      moved.set(p.id, { date: c.date, billId: c.billId, credit: c });
      creditOf.set(c.id, groupKey);
      claimed.add(c.id);
    });
  }

  const byId = new Map<string, PlanEntry>();
  const groupIds = new Map<string, string[]>();
  for (const p of parcels) {
    const move = moved.get(p.id);
    byId.set(p.id, {
      date: move?.date ?? p.date,
      installment: { number: p.number, total: p.total, purchaseDate: p.purchase, groupKey: p.groupKey },
      ...(move?.billId ? { billId: move.billId } : {}),
    });
    groupIds.set(p.groupKey, [...(groupIds.get(p.groupKey) ?? []), p.id]);
  }
  for (const [creditId, groupKey] of creditOf) {
    const credit = credits.find((c) => c.id === creditId)!;
    byId.set(creditId, { date: credit.date, creditOf: groupKey });
  }
  return { byId, groups: groupIds, dateOf: (id, raw) => byId.get(id)?.date ?? raw.slice(0, 10) };
}
