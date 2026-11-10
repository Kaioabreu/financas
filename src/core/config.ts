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
  /**
   * Pluggy categoryId prefix -> app category. A key is an id without its trailing zeros, at least 2 digits
   * ("19" is the Transportation group, "190504" a leaf); the longest matching prefix wins.
   */
  categoryIdMap: Record<string, AppCategory>;
  /** Pluggy category (normalized name) -> app category; the fallback when the id is missing or unknown. */
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
    { contains: "CONTA REMUNERADA - RESGATE APLICACAO", nature: "own-transfer" },
    { contains: "CONTA REMUNERADA - RESGATE REMUNERACAO", direction: "credit", nature: "income", origin: "yield" },
    { contains: "", operationType: "RENDIMENTO_APLIC_FINANCEIRA", direction: "credit", nature: "income", origin: "yield" },
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
  // Pluggy's taxonomy (130 categories, docs/categorias-pluggy.md): the id's longest known prefix decides.
  categoryIdMap: {
    "10": "groceries",
    "11": "food",
    "12": "travel",
    "13": "other",
    "14": "leisure",
    "15": "fees-taxes",
    "16": "fees-taxes",
    "17": "fixed-bills",
    "1703": "shopping",
    "18": "health",
    "19": "transport",
    "19050004": "fees-taxes",
    "19050006": "fees-taxes",
    "20": "fixed-bills",
    "21": "leisure",
    "99": "other",
    "01": "other",
    "02": "fees-taxes",
    "0203": "fixed-bills",
    "0204": "fixed-bills",
    "03": "other",
    "04": "other",
    "05": "other",
    "06": "fees-taxes",
    "0602": "other",
    "07": "other",
    "0701": "fixed-bills",
    "0702": "other",
    "0703": "health",
    "0704": "leisure",
    "08": "shopping",
    "0809": "other",
    "09": "subscriptions",
    "0901": "leisure",
  },
  categoryMap: {
    // other
    income: "other",
    salary: "other",
    retirement: "other",
    "entrepreneurial activities": "other",
    "government aid": "other",
    "non-recurring income": "other",
    investments: "other",
    "automatic investment": "other",
    "fixed income": "other",
    "mutual funds": "other",
    "variable income": "other",
    margin: "other",
    "proceeds interests and dividends": "other",
    pension: "other",
    "same person transfer": "other",
    "same person transfer - cash": "other",
    "same person transfer - pix": "other",
    "same person transfer - ted": "other",
    transfers: "other",
    "transfer - bank slip": "other",
    "transfer - cash": "other",
    "transfer - check": "other",
    "transfer - doc": "other",
    "transfer - foreign exchange": "other",
    "transfer - internal": "other",
    "transfer - pix": "other",
    "transfer - ted": "other",
    "third party transfers": "other",
    "third party transfer - bank slip": "other",
    "third party transfer - debit card": "other",
    "third party transfer - doc": "other",
    "third party transfer - pix": "other",
    "third party transfer - ted": "other",
    "credit card payment": "other",
    alimony: "other",
    services: "other",
    education: "other",
    "online courses": "other",
    university: "other",
    school: "other",
    kindergarten: "other",
    cashback: "other",
    donations: "other",
    other: "other",
    // fees-taxes
    "vehicle ownership taxes and fees": "fees-taxes",
    "traffic tickets": "fees-taxes",
    "loans and financing": "fees-taxes",
    "late payment and overdraft costs": "fees-taxes",
    "interests charged": "fees-taxes",
    "legal obligations": "fees-taxes",
    "blocked balances": "fees-taxes",
    taxes: "fees-taxes",
    "income taxes": "fees-taxes",
    "taxes on investments": "fees-taxes",
    "tax on financial operations": "fees-taxes",
    "bank fees": "fees-taxes",
    "account fees": "fees-taxes",
    "wire transfer fees and atm fees": "fees-taxes",
    "credit card fees": "fees-taxes",
    // fixed-bills
    financing: "fixed-bills",
    "real estate financing": "fixed-bills",
    "vehicle financing": "fixed-bills",
    "student loan": "fixed-bills",
    loans: "fixed-bills",
    telecommunications: "fixed-bills",
    internet: "fixed-bills",
    mobile: "fixed-bills",
    tv: "fixed-bills",
    housing: "fixed-bills",
    rent: "fixed-bills",
    utilities: "fixed-bills",
    water: "fixed-bills",
    electricity: "fixed-bills",
    gas: "fixed-bills",
    "urban land and building tax": "fixed-bills",
    insurance: "fixed-bills",
    "life insurance": "fixed-bills",
    "home insurance": "fixed-bills",
    "health insurance": "fixed-bills",
    "vehicle insurance": "fixed-bills",
    "contas fixas": "fixed-bills",
    // health
    "wellness and fitness": "health",
    "gyms and fitness centers": "health",
    "sports practice": "health",
    wellness: "health",
    healthcare: "health",
    dentist: "health",
    pharmacy: "health",
    optometry: "health",
    "hospital clinics and labs": "health",
    saude: "health",
    // leisure
    tickets: "leisure",
    "stadiums and arenas": "leisure",
    "landmarks and museums": "leisure",
    "cinema, theater and concerts": "leisure",
    gaming: "leisure",
    gambling: "leisure",
    lottery: "leisure",
    "online bet": "leisure",
    leisure: "leisure",
    lazer: "leisure",
    "video games": "leisure",
    // shopping
    shopping: "shopping",
    "online shopping": "shopping",
    electronics: "shopping",
    "pet supplies and vet": "shopping",
    clothing: "shopping",
    "kids and toys": "shopping",
    bookstore: "shopping",
    "sports goods": "shopping",
    "office supplies": "shopping",
    houseware: "shopping",
    compras: "shopping",
    // subscriptions
    "digital services": "subscriptions",
    "video streaming": "subscriptions",
    "music streaming": "subscriptions",
    subscriptions: "subscriptions",
    "streaming services": "subscriptions",
    assinaturas: "subscriptions",
    // groceries
    groceries: "groceries",
    supermarket: "groceries",
    mercado: "groceries",
    supermercado: "groceries",
    // food
    "food and drinks": "food",
    "eating out": "food",
    "food delivery": "food",
    restaurants: "food",
    bars: "food",
    alimentacao: "food",
    restaurante: "food",
    // travel
    travel: "travel",
    "airport and airlines": "travel",
    accomodation: "travel",
    "mileage programs": "travel",
    "bus tickets": "travel",
    viagem: "travel",
    hotels: "travel",
    airlines: "travel",
    // transport
    transportation: "transport",
    "taxi and ride-hailing": "transport",
    "public transportation": "transport",
    "car rental": "transport",
    bicycle: "transport",
    automotive: "transport",
    "gas stations": "transport",
    parking: "transport",
    "tolls and in vehicle payment": "transport",
    "vehicle maintenance": "transport",
    taxi: "transport",
    "ride-hailing": "transport",
    transporte: "transport",
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
