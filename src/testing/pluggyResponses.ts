// Builders for Pluggy API responses, shaped like the anonymized dump.
// Every value is synthetic: no real name, CPF, amount or description lives here.

export const SYNTHETIC_CLIENT_ID = "00000000-aaaa-bbbb-cccc-000000000001";
export const SYNTHETIC_CLIENT_SECRET = "synthetic-secret-0001";

export function authResponse(apiKey = "synthetic-api-key-1") {
  return { apiKey };
}

export function authError(status: 401 | 403 = 401) {
  return {
    status,
    body: { code: status, message: status === 401 ? "Invalid credentials" : "Forbidden" },
  };
}

function baseItem() {
  return {
    id: "11111111-0000-0000-0000-000000000001",
    connector: { id: 200, name: "MeuPluggy" },
    status: "UPDATED" as string,
    executionStatus: "SUCCESS" as string,
    createdAt: "2026-01-10T12:00:00.000Z",
    updatedAt: "2026-11-01T06:00:00.000Z",
    lastUpdatedAt: "2026-11-01T06:00:00.000Z",
    consentExpiresAt: "2027-01-10T12:00:00.000Z",
    error: null as null | { code: string; message: string },
  };
}
export function item(overrides: Partial<ReturnType<typeof baseItem>> = {}) {
  return { ...baseItem(), ...overrides };
}

function baseAccount() {
  return {
    id: "22222222-0000-0000-0000-000000000001",
    itemId: "11111111-0000-0000-0000-000000000001",
    type: "BANK" as string,
    subtype: "CHECKING_ACCOUNT" as string,
    name: "Conta Sintética",
    number: "0000/00000-0",
    balance: 1000,
    currencyCode: "BRL",
    bankData: { transferNumber: "000/0000/00000-0", closingBalance: 1000 },
    reservedBalances: [] as unknown[],
  };
}
export function account(overrides: Partial<ReturnType<typeof baseAccount>> = {}) {
  return { ...baseAccount(), ...overrides };
}

function baseCard() {
  return {
    ...baseAccount(),
    id: "22222222-0000-0000-0000-000000000002",
    type: "CREDIT",
    subtype: "CREDIT_CARD",
    name: "Cartão Sintético",
    balance: 250,
    creditData: {
      level: "PLATINUM",
      brand: "VISA",
      balanceCloseDate: "2026-10-25",
      balanceDueDate: "2026-11-05",
      creditLimit: 5000,
      availableCreditLimit: 4750,
    },
  };
}
export function creditCard(overrides: Partial<ReturnType<typeof baseCard>> = {}) {
  return { ...baseCard(), ...overrides };
}

function baseBill() {
  return {
    id: "33333333-0000-0000-0000-000000000001",
    dueDate: "2026-11-05T00:00:00.000Z",
    totalAmount: 250,
    totalAmountCurrencyCode: "BRL",
    minimumPaymentAmount: 25,
    allowsInstallments: true,
    financeCharges: [] as unknown[],
    billClosingDate: undefined as string | undefined,
  };
}
export function bill(overrides: Partial<ReturnType<typeof baseBill>> = {}) {
  return { ...baseBill(), ...overrides };
}

function baseTransaction() {
  return {
    id: "44444444-0000-0000-0000-000000000001",
    accountId: "22222222-0000-0000-0000-000000000001",
    date: "2026-10-20T12:00:00.000Z",
    description: "COMPRA SINTETICA LOJA",
    descriptionRaw: null as string | null,
    amount: -42.5,
    amountInAccountCurrency: null as number | null,
    currencyCode: "BRL",
    balance: null as number | null,
    category: "Shopping",
    categoryId: "08000000",
    status: "POSTED" as string,
    type: "DEBIT" as string,
    operationType: null as string | null,
    creditCardMetadata: null as null | {
      installmentNumber: number;
      totalInstallments: number;
      totalAmount: number;
      purchaseDate: string;
      billId: string;
    },
    paymentData: null as unknown,
    merchant: null as unknown,
  };
}
export function transaction(overrides: Partial<ReturnType<typeof baseTransaction>> = {}) {
  return { ...baseTransaction(), ...overrides };
}

function baseInvestment() {
  return {
    id: "55555555-0000-0000-0000-000000000001",
    itemId: "11111111-0000-0000-0000-000000000001",
    type: "FIXED_INCOME" as string,
    subtype: "CDB" as string,
    name: "CDB Sintético",
    balance: 5000,
    amount: 5000,
    amountOriginal: 4800,
    date: "2026-11-01T00:00:00.000Z",
    currencyCode: "BRL",
    status: "ACTIVE" as string,
  };
}
export function investment(overrides: Partial<ReturnType<typeof baseInvestment>> = {}) {
  return { ...baseInvestment(), ...overrides };
}

export function investmentTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "66666666-0000-0000-0000-000000000001",
    type: "BUY",
    tradeDate: "2026-10-05T00:00:00.000Z",
    date: "2026-10-05T00:00:00.000Z",
    description: "APLICACAO SINTETICA",
    quantity: 1,
    value: 100,
    amount: 100,
    ...overrides,
  };
}

export function identity(overrides: Record<string, unknown> = {}) {
  return {
    id: "77777777-0000-0000-0000-000000000001",
    itemId: "11111111-0000-0000-0000-000000000001",
    fullName: "Pessoa Sintética",
    document: "00000000000",
    documentType: "CPF",
    financialRelationships: { paychecksBankLink: [] as unknown[] },
    ...overrides,
  };
}

/** Pluggy list envelope. */
export function page<T>(results: T[], next: string | null = null) {
  return { results, total: results.length, page: 1, totalPages: 1, next };
}
