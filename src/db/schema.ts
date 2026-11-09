import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
