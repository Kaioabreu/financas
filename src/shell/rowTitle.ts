import { cleanMerchantName } from "../core/merchantName";
import { embeddedConfig } from "../core/config";
import { pixLabel, type PixLabel } from "./pixLabel";

/** The title of a row in the Transações list: Pix standard, else the cleaned merchant name. */
export function rowTitle(description: string, amount: number, aliases = embeddedConfig.merchantAliases): PixLabel {
  const label = pixLabel(description, amount);
  if (label.kind !== "other") return label;
  return { ...label, title: cleanMerchantName(description, aliases) || description };
}
