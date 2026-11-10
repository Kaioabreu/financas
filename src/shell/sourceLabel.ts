import type { AccountSummary } from "../core/connections";

/** Pluggy names an account after the legal entity ("Nu Pagamentos S.A. - Instituição de Pagamento"). */
const LEGAL_NAME = /\bS\.?A\.?(?=\s|$)|\bLTDA\b| - /i;

/**
 * The chip text for an account or card. A card is "Cartão <name>" (its own name when that already says
 * "Cartão", else the bank's); an account keeps its name unless it is a legal entity, then it is the bank's.
 */
export function sourceLabel(a: Pick<AccountSummary, "kind" | "name" | "bankName">): string {
  if (a.kind === "card") return /^cart[aã]o/i.test(a.name) ? a.name : `Cartão ${a.bankName}`;
  return LEGAL_NAME.test(a.name) ? a.bankName : a.name;
}
