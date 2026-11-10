// Embedded configuration: limits and constants shipped with the app.
import type { AppCategory, IncomeOrigin, Nature } from "./classification";

/** A Regra embutida: how a bank marks certain transactions. Matched on the description. */
export interface BuiltInRule {
  /** Text the description must contain (case and accents ignored). */
  contains: string;
  /** Restricts the rule to money in ("credit") or out ("debit"). */
  direction?: "credit" | "debit";
  /** Restricts the rule to this Pluggy operationType. */
  operationType?: string;
  nature: Nature;
  category?: AppCategory;
  origin?: IncomeOrigin;
}
export interface EmbeddedConfig {
  pluggyBaseUrl: string;
  /** Pluggy apiKey lifetime (2 h). */
  apiKeyTtlMs: number;
  guideUrl: string;
  /** Pluggy MeuPluggy connector id. */
  meuPluggyConnectorId: number;
  /** How often an item is polled while connecting. */
  pollIntervalMs: number;
  /** An item that is not UPDATED after this long is deleted. */
  authorizationTimeoutMs: number;
  /** After the Custom Tab closes, how long to wait before deciding nothing was authorized. */
  tabClosedGraceMs: number;
  /** A full read that would delete more than this share of a product deletes nothing. */
  mirrorDeleteLimit: number;
  /** Extra attempts per request (so 3 in all). */
  requestRetries: number;
  /** Wait between attempts after a network error or a 5xx. */
  retryDelayMs: number;
  /** Longest Retry-After the core honours on a 429. */
  maxRetryAfterMs: number;
  /** Rules shipped with the app (OTA-updatable). The first match wins. */
  builtInRules: BuiltInRule[];
  /** Pluggy category (normalized name) -> app category. */
  categoryMap: Record<string, AppCategory>;
  /** Largest gap, in days, between a card bill payment and the account debit that paid it. */
  billPaymentToleranceDays: number;
  /** Pluggy operationTypes that count as a transfer when the payer is the employer. */
  salaryTransferOperationTypes: string[];
  /** Pluggy operationTypes that are salary by themselves. */
  salaryOperationTypes: string[];
  /** Pluggy categories (normalized) that are salary by themselves. */
  salaryCategories: string[];
  /** Banks whose bill check is validated: only these show the Lacuna note (OTA-updatable). */
  gapBanks: string[];
  /** Fallback only: a bill closes this many days before its due date when Pluggy sends no billClosingDate. */
  billClosingDaysBeforeDue: number;
}

export const embeddedConfig: EmbeddedConfig = {
  pluggyBaseUrl: "https://api.pluggy.ai",
  apiKeyTtlMs: 2 * 60 * 60 * 1000,
  guideUrl: "https://github.com/Kaioabreu/financas/blob/main/docs/guia-de-entrada.md",
  meuPluggyConnectorId: 200,
  pollIntervalMs: 3_000,
  authorizationTimeoutMs: 4 * 60 * 1000,
  tabClosedGraceMs: 5_000,
  mirrorDeleteLimit: 0.2,
  requestRetries: 2,
  retryDelayMs: 1_000,
  maxRetryAfterMs: 60_000,
  builtInRules: [
    { contains: "CONTA REMUNERADA - APLICACAO AUTOMATICA", nature: "own-transfer" },
    { contains: "CONTA REMUNERADA - RESGATE AUTOMATICO", nature: "own-transfer" },
    { contains: "COMPRA DE TESOURO", direction: "debit", nature: "investment" },
    { contains: "COMPRA - CDB", direction: "debit", nature: "investment" },
    { contains: "EMISSAO - CDB", direction: "debit", nature: "investment" },
    { contains: "VENDA DE TESOURO DIRETO", direction: "credit", nature: "withdrawal" },
    { contains: "LIQ BOLSA - VISTA BRUTO", direction: "debit", nature: "investment" },
    { contains: "LIQ BOLSA - VISTA BRUTO", direction: "credit", nature: "withdrawal" },
    { contains: "LIQ BOLSA - VISTA TX", nature: "expense", category: "fees-taxes" },
    { contains: "TAXA SOBRE VALOR EM CUSTODIA", nature: "expense", category: "fees-taxes" },
    { contains: "IR - BTC", nature: "expense", category: "fees-taxes" },
    { contains: "CUPOM - CRA", nature: "income", origin: "yield" },
    { contains: "TAXA REMUNERACAO - BTC", nature: "income", origin: "yield" },
    { contains: "RENDIMENTOS", operationType: "RESGATE_APLIC_FINANCEIRA", nature: "income", origin: "yield" },
    { contains: "", operationType: "TRANSFERENCIA_SALDO_RESERVADO", direction: "debit", nature: "investment" },
    { contains: "", operationType: "TRANSFERENCIA_SALDO_RESERVADO", direction: "credit", nature: "withdrawal" },
    { contains: "JCP", direction: "credit", nature: "income", origin: "yield" },
    { contains: "DIVIDENDO", direction: "credit", nature: "income", origin: "yield" },
    { contains: "RENDIMENTO FII", direction: "credit", nature: "income", origin: "yield" },
    { contains: "RENDIMENTOS FII", direction: "credit", nature: "income", origin: "yield" },
    { contains: "IOF DE COMPRA INTERNACIONAL", nature: "expense", category: "fees-taxes" },
    { contains: "DESCONTO NA PARCELA", direction: "credit", nature: "refund" },
    { contains: "CANC PARCELA", direction: "credit", nature: "refund" },
    { contains: "CANCELAMENTO PARCIAL DE COMPRA", direction: "credit", nature: "refund" },
  ],
  categoryMap: {
    groceries: "groceries", supermarket: "groceries", mercado: "groceries", supermercado: "groceries",
    "food and drinks": "food", restaurants: "food", bars: "food", alimentacao: "food", restaurante: "food",
    transportation: "transport", taxi: "transport", "ride-hailing": "transport", "gas stations": "transport", transporte: "transport",
    shopping: "shopping", compras: "shopping", clothing: "shopping", electronics: "shopping",
    leisure: "leisure", gambling: "leisure", "video games": "leisure", lazer: "leisure",
    healthcare: "health", pharmacy: "health", saude: "health",
    travel: "travel", viagem: "travel", hotels: "travel", airlines: "travel",
    "digital services": "subscriptions", subscriptions: "subscriptions", "streaming services": "subscriptions", assinaturas: "subscriptions",
    housing: "fixed-bills", utilities: "fixed-bills", insurance: "fixed-bills", telecommunications: "fixed-bills", "contas fixas": "fixed-bills",
    taxes: "fees-taxes", "bank fees": "fees-taxes", "income taxes": "fees-taxes", "legal obligations": "fees-taxes",
  },
  billPaymentToleranceDays: 3,
  salaryTransferOperationTypes: ["InternalTransfer", "TRANSFERENCIA_MESMA_INSTITUICAO", "TED", "DOC", "PIX"],
  salaryOperationTypes: ["FOLHA_PAGAMENTO"],
  salaryCategories: ["salary", "salario"],
  // BTG is out on purpose: Pluggy's BTG bill totalAmount is not the real invoice total (checked against the
  // author's invoice spreadsheet: a ~6.4k invoice comes as ~1.35k), so it raised false gaps every month.
  // A bank stays here only while its bills reconcile on real data.
  gapBanks: ["Mercado Pago", "Nubank"],
  billClosingDaysBeforeDue: 7,
};
