import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Spike table: proves migrations run on the encrypted database. Real schema arrives in #26.
export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
