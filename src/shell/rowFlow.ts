import type { TransactionRow } from "../core/connections";
import type { IconName } from "./icons/paths";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Direction by nature, never by the raw sign (Pluggy sends a card purchase as positive and an account
 * debit as negative). "out" is expense-like, "in" income-like, "neutral" an own transfer or personal loan.
 */
export type Flow = "out" | "in" | "neutral";
export function flowOf(r: Pick<TransactionRow, "nature">): Flow {
  switch (r.nature) {
    case "expense":
    case "investment":
    case "bill-payment":
      return "out";
    case "income":
    case "refund":
    case "withdrawal":
      return "in";
    default:
      return "neutral";
  }
}

/** "-R$ 10,00" for out, "+R$ 10,00" for in, no sign for neutral. */
export function signedAmount(r: Pick<TransactionRow, "nature" | "amount">): string {
  const flow = flowOf(r);
  const text = brl.format(Math.abs(r.amount));
  return flow === "out" ? `-${text}` : flow === "in" ? `+${text}` : text;
}

export function amountColor(flow: Flow, c: { ink: string; ink2: string }, positive: string): string {
  return flow === "out" ? c.ink : flow === "in" ? positive : c.ink2;
}

/** The direction glyph of a row that has no category icon. */
export function directionIcon(r: Pick<TransactionRow, "nature">): IconName {
  if (r.nature === "own-transfer") return "own-transfer";
  if (r.nature === "investment" || r.nature === "withdrawal") return "investment";
  return flowOf(r) === "in" ? "in" : "out";
}
