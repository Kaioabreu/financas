// Core: Faturas e Lacuna. For each closed bill of a card it checks that the card transactions
// add up to the bill's totalAmount minus the previous bill's. Whatever is missing is the Lacuna.
// Which bill a transaction belongs to comes from creditCardMetadata.billId (Pluggy's own link), never
// from dates; the closing date (billClosingDate) only gives the cycle shown and sorts a payment into a bill.
// A pure function of what is stored, redone on every read, so a Lacuna vanishes as soon as Pluggy
// delivers what was missing. Nothing here enters the numbers of the Resumo or Gastos.
import { account, bankTransaction, bill, connection } from "../db/schema";
import type { EmbeddedConfig } from "./config";
import type { CoreDatabase } from "./createCore";
import { addMonths, buildInstallmentPlan } from "./installments";

export interface BillGap {
  billId: string;
  accountId: string;
  cardName: string;
  /** Absolute value, in reais. */
  amount: number;
  /** "missing": the bill is larger than its transactions. "extra": the transactions add up to more. */
  kind: "missing" | "extra";
  /** YYYY-MM-DD: the bill's cycle. */
  from: string;
  to: string;
  /** Set when the gap is exactly the value of one parcel missing from a group of this card. */
  installment?: { number: number; total: number; store: string };
  /** The note, without "Saiba mais". */
  text: string;
}

export interface BillCounts {
  verified: number;
  matching: number;
  mismatching: number;
}

export interface BillsApi {
  /** The Lacuna notes of validated banks whose bill cycle touches `month` (YYYY-MM), optionally for one card. */
  billGaps(query: { month: string; accountId?: string }): Promise<BillGap[]>;
}

interface CardCheck {
  accountId: string;
  cardName: string;
  validated: boolean;
  checks: { billId: string; gapCents: number; from: string; to: string; installment?: BillGap["installment"] }[];
}

const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const cents = (v: number) => Math.round(v * 100);
const dd_mm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function reais(valueCents: number): string {
  const whole = String(Math.floor(valueCents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${whole},${String(valueCents % 100).padStart(2, "0")}`;
}

function metadata(extra: string | null): any {
  try {
    return extra ? (JSON.parse(extra).creditCardMetadata ?? null) : null;
  } catch {
    return null;
  }
}

const isPaymentSignal = (category: string | null, operationType: string | null) =>
  normalize(category ?? "") === "credit card payment" || operationType === "PAGAMENTO_FATURA";

const stripParcel = (text: string) => text.replace(/\s*-?\s*parcela\s*\d+\s*(\/|de)\s*\d+\s*$/i, "").trim();

export function createBills(deps: { db: CoreDatabase; config: EmbeddedConfig; clock: () => number }): BillsApi & {
  otherBankCounts(): Promise<BillCounts[]>;
} {
  const { db, config } = deps;

  async function checkAll(): Promise<CardCheck[]> {
    const now = new Date(deps.clock());
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const accounts = await db.select().from(account);
    const banks = new Map((await db.select().from(connection)).map((c) => [c.itemId, c.bankName]));
    const allBills = await db.select().from(bill);
    const txs = await db.select().from(bankTransaction);
    const plan = await buildInstallmentPlan(db);
    // The cycle's last day: Pluggy's billClosingDate (the source of truth for the cycle), else the guess.
    const closeOf = (b: typeof bill.$inferSelect) => {
      let sent: unknown;
      try {
        sent = b.extra ? JSON.parse(b.extra).billClosingDate : undefined;
      } catch {}
      return typeof sent === "string" && /^\d{4}-\d{2}-\d{2}/.test(sent) ? sent.slice(0, 10) : addDays(b.dueDate.slice(0, 10), -config.billClosingDaysBeforeDue);
    };

    const result: CardCheck[] = [];
    for (const card of accounts.filter((a) => a.type === "CREDIT")) {
      const bills = allBills.filter((b) => b.accountId === card.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const index = new Map(bills.map((b, i) => [b.id, i]));
      const label = normalize(`${card.name} ${banks.get(card.itemId) ?? ""}`);
      const validated = config.gapBanks.some((bank) => label.includes(normalize(bank)));

      // Each transaction goes to the bill it counts in, with the signed value in the account currency.
      const sums = bills.map(() => 0);
      const cardTxs = txs.filter((t) => t.accountId === card.id);
      for (const t of cardTxs) {
        const meta = metadata(t.extra);
        const billId: string | undefined = plan.byId.get(t.id)?.billId ?? meta?.billId;
        let at = billId === undefined ? undefined : index.get(billId);
        if (at === undefined) continue;
        const value = t.amountInAccountCurrency ?? t.amount;
        const isCredit = t.type ? t.type === "CREDIT" : value < 0;
        if (isCredit && isPaymentSignal(t.category, t.operationType) && t.date.slice(0, 10) > closeOf(bills[at]!)) at += 1;
        if (at >= bills.length) continue;
        sums[at]! += isCredit ? -Math.abs(cents(value)) : Math.abs(cents(value));
      }

      const checks: CardCheck["checks"] = [];
      for (let i = 1; i < bills.length; i++) {
        const b = bills[i]!;
        const previous = bills[i - 1]!;
        if (b.dueDate.slice(0, 10) > today || b.totalAmount === null || previous.totalAmount === null) continue;
        const gapCents = cents(b.totalAmount) - cents(previous.totalAmount) - sums[i]!;
        const from = addDays(closeOf(previous), 1);
        const to = closeOf(b);
        checks.push({ billId: b.id, gapCents, from, to, ...(gapCents > 0 ? { installment: missingParcel(cardTxs, plan, gapCents, from, to) } : {}) });
      }
      result.push({ accountId: card.id, cardName: card.name, validated, checks });
    }
    return result;
  }

  /** A parcel absent from a group of this card whose day falls in the cycle and whose value is the gap. */
  function missingParcel(
    cardTxs: (typeof bankTransaction.$inferSelect)[],
    plan: Awaited<ReturnType<typeof buildInstallmentPlan>>,
    gapCents: number,
    from: string,
    to: string,
  ): BillGap["installment"] | undefined {
    const groups = new Map<string, { numbers: Set<number>; total: number; purchase: string; values: number[]; store: string }>();
    for (const t of cardTxs) {
      const info = plan.byId.get(t.id)?.installment;
      if (!info) continue;
      const g = groups.get(info.groupKey) ?? { numbers: new Set(), total: info.total, purchase: info.purchaseDate, values: [], store: stripParcel(t.description) };
      g.numbers.add(info.number);
      g.values.push(Math.abs(cents(t.amountInAccountCurrency ?? t.amount)));
      groups.set(info.groupKey, g);
    }
    for (const g of groups.values()) {
      for (let k = 1; k <= g.total; k++) {
        if (g.numbers.has(k)) continue;
        const natural = addMonths(g.purchase, k - 1);
        if (natural >= from && natural <= to && g.values.includes(gapCents)) return { number: k, total: g.total, store: g.store };
      }
    }
    return undefined;
  }

  return {
    async billGaps({ month, accountId }) {
      const gaps: BillGap[] = [];
      for (const card of await checkAll()) {
        if (!card.validated || (accountId && card.accountId !== accountId)) continue;
        for (const c of card.checks) {
          if (c.gapCents === 0 || c.from.slice(0, 7) > month || c.to.slice(0, 7) < month) continue;
          const amountCents = Math.abs(c.gapCents);
          const cycle = `compras de ${dd_mm(c.from)} a ${dd_mm(c.to)}`;
          const missing = c.gapCents > 0;
          const base = missing ? `Faltam ${reais(amountCents)} do ${card.cardName}, ${cycle}` : `Há ${reais(amountCents)} a mais no ${card.cardName}, ${cycle}`;
          gaps.push({
            billId: c.billId,
            accountId: card.accountId,
            cardName: card.cardName,
            amount: amountCents / 100,
            kind: missing ? "missing" : "extra",
            from: c.from,
            to: c.to,
            ...(c.installment ? { installment: c.installment } : {}),
            text: c.installment ? `${base}. Faltou a parcela ${c.installment.number} de ${c.installment.total} de ${c.installment.store}` : base,
          });
        }
      }
      return gaps;
    },

    async otherBankCounts() {
      return (await checkAll())
        .filter((card) => !card.validated)
        .map((card) => ({
          verified: card.checks.length,
          matching: card.checks.filter((c) => c.gapCents === 0).length,
          mismatching: card.checks.filter((c) => c.gapCents !== 0).length,
        }));
    },
  };
}
