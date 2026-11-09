// Core: classification. A pure function of the raw Pluggy fields, the user's CPF, the holder's
// Identity and the embedded configuration. It is recomputed on every read and never stored,
// so an OTA update of the built-in rules reclassifies everything without reading Pluggy again.
// (User rules and manual edits join the precedence in ticket #30.)
import { eq } from "drizzle-orm";
import { account, appMeta, bankTransaction, identity } from "../db/schema";
import type { EmbeddedConfig } from "./config";
import type { CoreDatabase } from "./createCore";

export type Nature =
  | "income"
  | "expense"
  | "refund"
  | "investment"
  | "withdrawal"
  | "own-transfer"
  | "bill-payment"
  | "personal-loan";
export type AppCategory =
  | "food"
  | "groceries"
  | "transport"
  | "shopping"
  | "leisure"
  | "health"
  | "travel"
  | "subscriptions"
  | "fixed-bills"
  | "fees-taxes"
  | "other";
export type IncomeOrigin = "salary" | "yield" | "other-income";

export interface Classification {
  nature: Nature;
  /** Only for expenses and refunds (optional on a refund). */
  category?: AppCategory;
  /** Only for income. */
  origin?: IncomeOrigin;
}

export type CpfStatus =
  | { state: "known"; cpf: string; source: "identity" | "manual" }
  | { state: "needed"; reason: "missing" | "conflict" };
export type SetCpfResult = { ok: true } | { ok: false; message: string };

export interface ClassificationApi {
  /** The CPF from the Connections' /identity; asks by hand only when none brings it or they disagree. */
  cpfStatus(): Promise<CpfStatus>;
  setCpf(cpf: string): Promise<SetCpfResult>;
}

/** Lower case, no accents: how rule texts and descriptions are compared. */
export function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
const digits = (value: unknown) => (typeof value === "string" ? value.replace(/\D/g, "") : "");

export function isValidCpf(cpf: string): boolean {
  const d = digits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

/** One stored transaction, with the account kind it belongs to. */
interface Row {
  id: string;
  card: boolean;
  date: string;
  description: string;
  amount: number;
  type: string | null;
  category: string | null;
  operationType: string | null;
  payerDoc: string;
  receiverDoc: string;
}

interface Context {
  config: EmbeddedConfig;
  cpf: string | null;
  employerDocs: Set<string>;
  /** Account debits that paid a card bill in the app. */
  matchedBillPayments: Set<string>;
}

const isCredit = (r: Row) => (r.type ? r.type === "CREDIT" : r.card ? r.amount < 0 : r.amount > 0);
const dayNumber = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86_400_000;

function builtInMatch(r: Row, config: EmbeddedConfig): Classification | null {
  const text = normalizeText(r.description);
  for (const rule of config.builtInRules) {
    if (rule.direction && (rule.direction === "credit") !== isCredit(r)) continue;
    if (rule.operationType && rule.operationType !== r.operationType) continue;
    if (!text.includes(normalizeText(rule.contains))) continue;
    const out: Classification = { nature: rule.nature };
    if (rule.category) out.category = rule.category;
    if (rule.origin) out.origin = rule.origin;
    return out;
  }
  return null;
}

function mappedCategory(r: Row, config: EmbeddedConfig): AppCategory | undefined {
  return r.category ? config.categoryMap[normalizeText(r.category)] : undefined;
}

function isBillPaymentSignal(r: Row): boolean {
  return normalizeText(r.category ?? "") === "credit card payment" || r.operationType === "PAGAMENTO_FATURA";
}

function classifyRow(r: Row, ctx: Context): Classification {
  const { config } = ctx;
  const credit = isCredit(r);

  // 1. Built-in rules
  const builtIn = builtInMatch(r, config);
  if (builtIn) return builtIn;

  // 2. Signals Pluggy gives
  const counterpart = credit ? r.payerDoc : r.receiverDoc;
  // Salary: the employer's document alone is not enough.
  if (credit && !r.card) {
    const fromEmployer =
      counterpart !== "" && ctx.employerDocs.has(counterpart) && config.salaryTransferOperationTypes.includes(r.operationType ?? "");
    if (
      fromEmployer ||
      config.salaryOperationTypes.includes(r.operationType ?? "") ||
      config.salaryCategories.includes(normalizeText(r.category ?? ""))
    ) {
      return { nature: "income", origin: "salary" };
    }
  }
  // Bill payment: the card side always counts; the account side only when it matches one.
  if (r.card && credit && isBillPaymentSignal(r)) return { nature: "bill-payment" };
  if (!r.card && !credit && ctx.matchedBillPayments.has(r.id)) return { nature: "bill-payment" };
  if (!r.card && !credit && isBillPaymentSignal(r)) return { nature: "expense", category: "other" };
  // Refund on the card.
  if (r.card && credit) {
    const text = normalizeText(`${r.description} ${r.operationType ?? ""}`);
    if (r.operationType === "ESTORNO" || r.operationType === "CASHBACK" || /estorno|cashback/.test(text)) {
      const category = mappedCategory(r, config);
      return category ? { nature: "refund", category } : { nature: "refund" };
    }
  }
  // Own transfer.
  if (ctx.cpf && counterpart === ctx.cpf) return { nature: "own-transfer" };

  // 3. No signal: money in from a third party is income, money out is an expense
  // (its category: Pluggy's, mapped to the app's 11, else Outros).
  if (credit) return { nature: "income", origin: "other-income" };
  return { nature: "expense", category: mappedCategory(r, config) ?? "other" };
}

export interface ClassificationDeps {
  db: CoreDatabase;
  config: EmbeddedConfig;
}
const CPF_KEY = "user.cpf";

export function createClassification(deps: ClassificationDeps) {
  const { db, config } = deps;

  async function cpfStatus(): Promise<CpfStatus> {
    const manual = (await db.select().from(appMeta).where(eq(appMeta.key, CPF_KEY)))[0]?.value;
    if (manual) return { state: "known", cpf: manual, source: "manual" };
    const found = new Set<string>();
    for (const row of await db.select().from(identity)) {
      const d = digits(row.document);
      if (d.length === 11 && (row.documentType ?? "CPF") === "CPF") found.add(d);
    }
    if (found.size === 0) return { state: "needed", reason: "missing" };
    if (found.size > 1) return { state: "needed", reason: "conflict" };
    return { state: "known", cpf: [...found][0]!, source: "identity" };
  }

  async function employerDocs(): Promise<Set<string>> {
    const docs = new Set<string>();
    for (const row of await db.select().from(identity)) {
      try {
        const links = JSON.parse(row.extra ?? "{}").paychecksBankLink;
        for (const link of Array.isArray(links) ? links : []) {
          const d = digits(link?.employerDocument);
          if (d) docs.add(d);
        }
      } catch {
        // an unreadable Identity just brings no employer
      }
    }
    return docs;
  }

  async function loadRows(): Promise<Row[]> {
    const accounts = new Map((await db.select().from(account)).map((a) => [a.id, a.type === "CREDIT"]));
    return (await db.select().from(bankTransaction)).map((t) => {
      let payerDoc = "";
      let receiverDoc = "";
      try {
        const payment = JSON.parse(t.extra ?? "{}").paymentData;
        payerDoc = digits(payment?.payer?.documentNumber?.value);
        receiverDoc = digits(payment?.receiver?.documentNumber?.value);
      } catch {
        // no payment data
      }
      return {
        id: t.id,
        card: accounts.get(t.accountId) ?? false,
        date: t.date,
        description: t.description,
        amount: t.amountInAccountCurrency ?? t.amount,
        type: t.type,
        category: t.category,
        operationType: t.operationType,
        payerDoc,
        receiverDoc,
      };
    });
  }

  /** Pairs each card bill payment with one account debit of the same value, within the tolerance. */
  function matchBillPayments(rows: Row[]): Set<string> {
    const matched = new Set<string>();
    const payments = rows
      .filter((r) => r.card && isCredit(r) && isBillPaymentSignal(r))
      .sort((a, b) => a.date.localeCompare(b.date));
    const debits = rows.filter((r) => !r.card && !isCredit(r) && !builtInMatch(r, config));
    for (const payment of payments) {
      let best: Row | null = null;
      let bestGap = Infinity;
      for (const debit of debits) {
        if (matched.has(debit.id)) continue;
        if (Math.round(Math.abs(debit.amount) * 100) !== Math.round(Math.abs(payment.amount) * 100)) continue;
        const gap = Math.abs(dayNumber(debit.date) - dayNumber(payment.date));
        if (gap <= config.billPaymentToleranceDays && gap < bestGap) {
          best = debit;
          bestGap = gap;
        }
      }
      if (best) matched.add(best.id);
    }
    return matched;
  }

  return {
    cpfStatus,
    async setCpf(input: string): Promise<SetCpfResult> {
      if (!isValidCpf(input)) return { ok: false, message: "Esse CPF não parece certo. Confira os 11 números." };
      const cpf = digits(input);
      await db.insert(appMeta).values({ key: CPF_KEY, value: cpf }).onConflictDoUpdate({ target: appMeta.key, set: { value: cpf } });
      return { ok: true } as const;
    },
    /** The classification of the given transactions, computed from what is stored right now. */
    async classify(ids: string[]): Promise<Map<string, Classification>> {
      const rows = await loadRows();
      const status = await cpfStatus();
      const ctx: Context = {
        config,
        cpf: status.state === "known" ? status.cpf : null,
        employerDocs: await employerDocs(),
        matchedBillPayments: matchBillPayments(rows),
      };
      const wanted = new Set(ids);
      return new Map(rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, classifyRow(r, ctx)]));
    },
  };
}
