import type { AppCategory, IncomeOrigin, Nature } from "../core/classification";

export const natureLabel: Record<Nature, string> = {
  income: "Receita",
  expense: "Gasto",
  refund: "Reembolso",
  investment: "Aporte",
  withdrawal: "Resgate",
  "own-transfer": "Transferência própria",
  "bill-payment": "Pagamento de fatura",
  "personal-loan": "Empréstimo pessoal",
};

export const originLabel: Record<IncomeOrigin, string> = {
  salary: "Salário",
  yield: "Rendimentos",
  "other-income": "Outras receitas",
};

/** Thin-stroke glyphs stand in until an icon set is added to the app. */
export const categoryLabel: Record<AppCategory, { name: string; icon: string }> = {
  food: { name: "Alimentação", icon: "◔" },
  groceries: { name: "Mercado", icon: "▦" },
  transport: { name: "Transporte", icon: "➜" },
  shopping: { name: "Compras", icon: "◧" },
  leisure: { name: "Lazer e games", icon: "◈" },
  health: { name: "Saúde", icon: "✚" },
  travel: { name: "Viagem", icon: "✈" },
  subscriptions: { name: "Assinaturas", icon: "↻" },
  "fixed-bills": { name: "Contas fixas", icon: "▤" },
  "fees-taxes": { name: "Tarifas e impostos", icon: "％" },
  other: { name: "Outros", icon: "○" },
};
