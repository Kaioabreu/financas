import type { IncomeOrigin, Nature } from "../core/classification";
import { cleanMerchantName } from "../core/merchantName";
import { embeddedConfig } from "../core/config";
import { natureLabel, originLabel } from "./labels";
import { pixLabel, type PixLabel } from "./pixLabel";

/** What the app made of the transaction, for the bank texts that are only a code. */
export interface RowContext {
  nature?: Nature;
  origin?: IncomeOrigin;
}

/** BTG sends these two as the whole description; the title says what they are. */
function codeTitle(description: string, amount: number, context: RowContext): string | undefined {
  const code = description.replace(/\s+/g, "").toLowerCase();
  if (code === "cardbankslip") return natureLabel["bill-payment"];
  if (code === "internaltransfer") {
    if (context.nature === "income" && context.origin === "salary") return originLabel.salary;
    if (context.nature === "own-transfer") return natureLabel["own-transfer"];
    return amount < 0 ? "Transferência enviada" : "Transferência recebida";
  }
  return undefined;
}

/** The title of a row in the Transações list: Pix standard, else the cleaned merchant name. */
export function rowTitle(description: string, amount: number, aliases = embeddedConfig.merchantAliases, context: RowContext = {}): PixLabel {
  const label = pixLabel(description, amount);
  if (label.kind !== "other") return label;
  const fromCode = codeTitle(description, amount, context);
  if (fromCode) return { ...label, title: fromCode };
  return { ...label, title: cleanMerchantName(description, aliases) || description };
}
