import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** A Conexão: one Pluggy item per bank. Keyed by the Pluggy item id. */
export const connection = sqliteTable("connection", {
  itemId: text("item_id").primaryKey(),
  bankName: text("bank_name").notNull(),
  connectorId: integer("connector_id"),
  createdAt: text("created_at"),
  consentExpiresAt: text("consent_expires_at"),
  /** "reading" | "done" | "failed" */
  readState: text("read_state").notNull(),
  /** Pluggy's `lastUpdatedAt` of the last read that finished writing. */
  lastReadAt: text("last_read_at"),
  /** False when the last attempt did not complete (local failure or the 20% lock). */
  attemptComplete: integer("attempt_complete", { mode: "boolean" }).notNull().default(true),
  /** True when the last full read was held back by the 20% lock. */
  lockTriggered: integer("lock_triggered", { mode: "boolean" }).notNull().default(false),
  /** JSON {product: ISO date}: the date of the data the app holds for each product. */
  productDates: text("product_dates"),
  /** The oldest of the product dates: "Dados de <data>". */
  dataAt: text("data_at"),
  /** JSON: the state of the estimate of the 12 months before the first read (see core/estimate.ts). */
  estimate: text("estimate"),
});

/** Bank accounts and credit cards, as Pluggy sent them (Pluggy ids). */
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  type: text("type").notNull(),
  subtype: text("subtype"),
  name: text("name").notNull(),
  number: text("number"),
  balance: real("balance"),
  currencyCode: text("currency_code"),
  /** JSON: bankData, creditData, reservedBalances. */
  extra: text("extra"),
});

/** Transactions as Pluggy sent them (Pluggy ids). */
export const bankTransaction = sqliteTable("bank_transaction", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  descriptionRaw: text("description_raw"),
  amount: real("amount").notNull(),
  amountInAccountCurrency: real("amount_in_account_currency"),
  currencyCode: text("currency_code"),
  balance: real("balance"),
  category: text("category"),
  categoryId: text("category_id"),
  status: text("status"),
  type: text("type"),
  operationType: text("operation_type"),
  /** JSON: creditCardMetadata, paymentData, merchant. */
  extra: text("extra"),
});

/** Credit card bills (Faturas), as Pluggy sent them. */
export const bill = sqliteTable("bill", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  dueDate: text("due_date").notNull(),
  totalAmount: real("total_amount"),
  currencyCode: text("currency_code"),
  minimumPaymentAmount: real("minimum_payment_amount"),
  /** JSON: allowsInstallments, financeCharges, payments. */
  extra: text("extra"),
});

export const investment = sqliteTable("investment", {
  id: text("id").primaryKey(),
  itemId: text("item_id").notNull(),
  type: text("type"),
  subtype: text("subtype"),
  name: text("name").notNull(),
  balance: real("balance"),
  amount: real("amount"),
  amountOriginal: real("amount_original"),
  date: text("date"),
  currencyCode: text("currency_code"),
  status: text("status"),
  /** JSON: the rest of what Pluggy sent. */
  extra: text("extra"),
});

export const investmentTransaction = sqliteTable("investment_transaction", {
  id: text("id").primaryKey(),
  investmentId: text("investment_id").notNull(),
  type: text("type"),
  date: text("date").notNull(),
  description: text("description"),
  quantity: real("quantity"),
  value: real("value"),
  amount: real("amount"),
  extra: text("extra"),
});

/** The holder's identity, as the item's /identity returned it. */
export const identity = sqliteTable("identity", {
  itemId: text("item_id").primaryKey(),
  fullName: text("full_name"),
  document: text("document"),
  documentType: text("document_type"),
  extra: text("extra"),
});

/** A Regra the user made: transactions whose description contains `contains` get a nature and/or category. */
export const userRule = sqliteTable("user_rule", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Normalized (lower case, no accents). */
  contains: text("contains").notNull(),
  nature: text("nature"),
  category: text("category"),
  origin: text("origin"),
});

/**
 * A classification the user set by hand on one transaction. It also keeps what identifies the
 * transaction (account, amount, description, date) so it can follow it if Pluggy recreates it.
 */
export const manualEdit = sqliteTable("manual_edit", {
  transactionId: text("transaction_id").primaryKey(),
  accountId: text("account_id").notNull(),
  amount: real("amount").notNull(),
  description: text("description").notNull(),
  date: text("date").notNull(),
  nature: text("nature").notNull(),
  category: text("category"),
  origin: text("origin"),
});

/**
 * A Retrato: what one Connection was worth on one day (JSON: lines per class, debt as negative,
 * and whether Pluggy signalled something missing). At most one per Connection and day; the last wins.
 */
export const snapshot = sqliteTable(
  "snapshot",
  {
    /** YYYY-MM-DD. */
    date: text("date").notNull(),
    itemId: text("item_id").notNull(),
    payload: text("payload").notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.itemId] })],
);
