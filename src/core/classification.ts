// Core: classification. A pure function of the raw Pluggy fields, the user's CPF, the holder's
// Identity and the embedded configuration. It is recomputed on every read and never stored,
// so an OTA update of the built-in rules reclassifies everything without reading Pluggy again.
// Precedence: manual edit > user rule > built-in rule > deduction > Pluggy's category > Outros.
import { cached } from "./dataVersion";
import { eq, inArray } from "drizzle-orm";
import { account, appMeta, bankTransaction, identity, installmentEdit, manualEdit, userRule } from "../db/schema";
import { buildInstallmentPlan, type InstallmentPlan } from "./installments";
import type { BuiltInRule, EmbeddedConfig } from "./config";
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

/** Where a classification came from: Pluggy (or the app's deduction), a rule, or a manual edit. */
export type ClassificationSource = "pluggy" | "rule" | "manual";
export type ClassifiedAs = Classification & { source: ClassificationSource };

/** What a rule gives the transactions it matches. At least one of the three. */
export interface RuleOutcome {
  nature?: Nature;
  category?: AppCategory;
  origin?: IncomeOrigin;
}
export interface RuleInput extends RuleOutcome {
  /** The text the description must contain (case and accents ignored). */
  contains: string;
}
export interface UserRule extends RuleInput {
  id: number;
}
export type RuleResult = { ok: true } | { ok: false; message: string };

export type CpfStatus =
  | { state: "known"; cpf: string; source: "identity" | "manual" }
  | { state: "needed"; reason: "missing" | "conflict" };
export type SetCpfResult = { ok: true } | { ok: false; message: string };

export interface ClassificationApi {
  /** The CPF from the Connections' /identity; asks by hand only when none brings it or they disagree. */
  cpfStatus(): Promise<CpfStatus>;
  setCpf(cpf: string): Promise<SetCpfResult>;
  /** Sets the classification of one transaction by hand; it then wins over every rule. */
  editTransaction(id: string, classification: Classification): Promise<void>;
  /** How many transactions the rule would catch: the ones not edited by hand. */
  previewRule(rule: RuleInput): Promise<{ count: number }>;
  addRule(rule: RuleInput): Promise<RuleResult>;
  deleteRule(id: number): Promise<void>;
  /** The user's rules (newest first) and the app's, which are read-only. */
  listRules(): Promise<{ user: UserRule[]; builtIn: BuiltInRule[] }>;
  /**
   * Called right after a read: a hand-edited transaction that vanished moves to the one that
   * appeared in its place (same account, amount and description; date up to 5 days later).
   */
  moveEdits(newIds: string[]): Promise<void>;
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
  /** Newest first. */
  userRules: UserRule[];
  edits: Map<string, Classification>;
  /** Hand edits that hold for a whole compra parcelada, by group. */
  groupEdits: Map<string, Classification>;
  plan: InstallmentPlan;
  rows: Map<string, Row>;
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

const ruleCatches = (contains: string, description: string) => normalizeText(description).includes(contains);

function classifyRow(r: Row, ctx: Context): ClassifiedAs {
  const edit = ctx.edits.get(r.id);
  if (edit) return { ...edit, source: "manual" };
  const entry = ctx.plan.byId.get(r.id);
  const groupEdit = entry?.installment ? ctx.groupEdits.get(entry.installment.groupKey) : undefined;
  if (groupEdit) return { ...groupEdit, source: "manual" };
  const base = autoClassify(r, ctx);
  const rule = ctx.userRules.find((u) => ruleCatches(u.contains, r.description));
  if (!rule) return entry?.creditOf ? settlementOf(base, entry.creditOf, ctx) : base;
  const nature = rule.nature ?? base.nature;
  const out: ClassifiedAs = { nature, source: "rule" };
  if (nature === "expense") out.category = rule.category ?? base.category ?? "other";
  else if (nature === "refund") {
    const category = rule.category ?? base.category;
    if (category) out.category = category;
  } else if (nature === "income") out.origin = rule.origin ?? base.origin ?? "other-income";
  return out;
}

/** The credit that settled parcels is a refund with the category of the purchase. */
function settlementOf(base: ClassifiedAs, groupKey: string, ctx: Context): ClassifiedAs {
  if (base.nature !== "refund") return base;
  const member = ctx.rows.get(ctx.plan.groups.get(groupKey)?.[0] ?? "");
  const purchase = member ? classifyRow(member, ctx) : null;
  return purchase?.nature === "expense" && purchase.category ? { ...base, category: purchase.category } : base;
}

function autoClassify(r: Row, ctx: Context): ClassifiedAs {
  const { config } = ctx;
  const credit = isCredit(r);

  // 1. Built-in rules
  const builtIn = builtInMatch(r, config);
  if (builtIn) return { ...builtIn, source: "rule" };
  const deduced = deduce(r, ctx, credit);
  return { ...deduced, source: "pluggy" };
}

function deduce(r: Row, ctx: Context, credit: boolean): Classification {
  const { config } = ctx;

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

/** Keeps only what the nature allows: category on expenses and refunds, origin on income. */
function tidy(c: Classification): Classification {
  const out: Classification = { nature: c.nature };
  if ((c.nature === "expense" || c.nature === "refund") && c.category) out.category = c.category;
  if (c.nature === "expense" && !out.category) out.category = "other";
  if (c.nature === "income") out.origin = c.origin ?? "other-income";
  return out;
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

  async function loadUserRules(): Promise<UserRule[]> {
    const rows = await db.select().from(userRule);
    return rows
      .sort((a, b) => b.id - a.id)
      .map((r) => ({
        id: r.id,
        contains: r.contains,
        ...(r.nature ? { nature: r.nature as Nature } : {}),
        ...(r.category ? { category: r.category as AppCategory } : {}),
        ...(r.origin ? { origin: r.origin as IncomeOrigin } : {}),
      }));
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
    async editTransaction(id: string, classification: Classification): Promise<void> {
      const [tx] = await db.select().from(bankTransaction).where(eq(bankTransaction.id, id));
      if (!tx) return;
      const c = tidy(classification);
      const group = (await buildInstallmentPlan(db)).byId.get(id)?.installment?.groupKey;
      if (group) {
        const plan = await buildInstallmentPlan(db);
        const set = { nature: c.nature, category: c.category ?? null, origin: c.origin ?? null };
        await db.insert(installmentEdit).values({ groupKey: group, ...set }).onConflictDoUpdate({ target: installmentEdit.groupKey, set });
        const members = plan.groups.get(group) ?? [];
        if (members.length) await db.delete(manualEdit).where(inArray(manualEdit.transactionId, members));
        return;
      }
      const values = {
        transactionId: id,
        accountId: tx.accountId,
        amount: tx.amountInAccountCurrency ?? tx.amount,
        description: tx.description,
        date: tx.date,
        nature: c.nature,
        category: c.category ?? null,
        origin: c.origin ?? null,
      };
      await db.insert(manualEdit).values(values).onConflictDoUpdate({ target: manualEdit.transactionId, set: values });
    },

    async previewRule(rule: RuleInput): Promise<{ count: number }> {
      const contains = normalizeText(rule.contains);
      if (!contains) return { count: 0 };
      const edited = new Set((await db.select().from(manualEdit)).map((e) => e.transactionId));
      const rows = await db.select().from(bankTransaction);
      // Installments covered by a group edit stay as the user set them, just like an edited transaction.
      const plan = await buildInstallmentPlan(db);
      const groupEdited = new Set((await db.select().from(installmentEdit)).map((e) => e.groupKey));
      const covered = (id: string) => {
        const key = plan.byId.get(id)?.installment?.groupKey;
        return key !== undefined && groupEdited.has(key);
      };
      return { count: rows.filter((t) => !edited.has(t.id) && !covered(t.id) && ruleCatches(contains, t.description)).length };
    },

    async addRule(rule: RuleInput): Promise<RuleResult> {
      const contains = normalizeText(rule.contains);
      if (!contains) return { ok: false, message: "Escreva o texto que a descrição deve conter." };
      if (!rule.nature && !rule.category && !rule.origin) return { ok: false, message: "Escolha uma natureza ou uma categoria." };
      await db.insert(userRule).values({ contains, nature: rule.nature ?? null, category: rule.category ?? null, origin: rule.origin ?? null });
      return { ok: true };
    },

    async deleteRule(id: number): Promise<void> {
      await db.delete(userRule).where(eq(userRule.id, id));
    },

    async listRules() {
      return { user: await loadUserRules(), builtIn: config.builtInRules };
    },

    async moveEdits(newIds: string[]): Promise<void> {
      if (newIds.length === 0) return;
      const edits = await db.select().from(manualEdit);
      if (edits.length === 0) return;
      const existing = new Set((await db.select({ id: bankTransaction.id }).from(bankTransaction)).map((t) => t.id));
      const orphans = edits.filter((e) => !existing.has(e.transactionId));
      if (orphans.length === 0) return;
      const edited = new Set(edits.map((e) => e.transactionId));
      const fresh = (await db.select().from(bankTransaction).where(inArray(bankTransaction.id, newIds)))
        .filter((t) => !edited.has(t.id))
        .sort((a, b) => a.date.localeCompare(b.date));
      const taken = new Set<string>();
      for (const old of orphans) {
        const target = fresh.find((t) => {
          if (taken.has(t.id) || t.accountId !== old.accountId || t.description !== old.description) return false;
          if (Math.round((t.amountInAccountCurrency ?? t.amount) * 100) !== Math.round(old.amount * 100)) return false;
          const days = dayNumber(t.date) - dayNumber(old.date);
          return days >= 0 && days <= 5;
        });
        if (!target) continue;
        taken.add(target.id);
        await db.delete(manualEdit).where(eq(manualEdit.transactionId, old.transactionId));
        await db.insert(manualEdit).values({
          ...old,
          transactionId: target.id,
          date: target.date,
          amount: target.amountInAccountCurrency ?? target.amount,
        });
      }
    },

    /** The classification of the given transactions, computed from what is stored right now. */
    async classify(ids: string[]): Promise<Map<string, ClassifiedAs>> {
      // The whole table is classified once per change of the data; each screen takes its slice.
      const all = await cached(db, "classifyAll", classifyAll);
      const out = new Map<string, ClassifiedAs>();
      for (const id of ids) {
        const c = all.get(id);
        if (c) out.set(id, c);
      }
      return out;
    },
  };

  async function classifyAll(): Promise<Map<string, ClassifiedAs>> {
    {
      const rows = await loadRows();
      const status = await cpfStatus();
      const ctx: Context = {
        config,
        cpf: status.state === "known" ? status.cpf : null,
        employerDocs: await employerDocs(),
        matchedBillPayments: matchBillPayments(rows),
        userRules: await loadUserRules(),
        plan: await buildInstallmentPlan(db),
        rows: new Map(),
        groupEdits: new Map(
          (await db.select().from(installmentEdit)).map((e) => [
            e.groupKey,
            tidy({ nature: e.nature as Nature, category: (e.category ?? undefined) as AppCategory | undefined, origin: (e.origin ?? undefined) as IncomeOrigin | undefined }),
          ]),
        ),
        edits: new Map(
          (await db.select().from(manualEdit)).map((e) => [
            e.transactionId,
            tidy({ nature: e.nature as Nature, category: (e.category ?? undefined) as AppCategory | undefined, origin: (e.origin ?? undefined) as IncomeOrigin | undefined }),
          ]),
        ),
      };
      ctx.rows = new Map(rows.map((r) => [r.id, r]));
      return new Map(rows.map((r) => [r.id, classifyRow(r, ctx)]));
    }
  }
}
