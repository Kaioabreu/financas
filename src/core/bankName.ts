// Core: the name a Connection shows. The Meu Pluggy item's connector is always the aggregator
// ("MeuPluggy"), so the bank comes from its accounts: the first 3 digits of an account's
// bankData.transferNumber are the bank's COMPE code.

const BANKS: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Banco Original",
  "237": "Bradesco",
  "260": "Nubank",
  "323": "Mercado Pago",
  "336": "C6 Bank",
  "341": "ItaÃº",
  "380": "PicPay",
  "403": "Cora",
  "422": "Safra",
  "748": "Sicredi",
  "756": "Sicoob",
};

export interface BankNameSource {
  type: string;
  name: string;
  /** bankData.transferNumber, "<banco>/<agÃªncia>/<conta>". */
  transferNumber: string | null;
}

/**
 * Distinct bank names in the order the accounts come, joined "A, B e C". A bank account gives its
 * COMPE code's name, or its own name for an unknown code; with no bank account or no readable name, "Conta <n>" (n = the Connection's position, from 1).
 */
export function deriveBankName(accounts: BankNameSource[], position: number): string {
  const names: string[] = [];
  const add = (name: string) => {
    const clean = name.trim();
    if (clean && !names.includes(clean)) names.push(clean);
  };
  for (const a of accounts.filter((a) => a.type !== "CREDIT")) {
    const code = /^(\d{3})\//.exec(a.transferNumber ?? "")?.[1];
    add((code && BANKS[code]) || a.name);
  }
  if (!names.length) return `Conta ${position}`;
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

