export interface Variant {
  name: string;
  slug: string;
  androidPackage: string;
  databaseName: string;
}

export function resolveVariant(appVariant: string | undefined): Variant {
  if (appVariant === undefined || appVariant === "" || appVariant === "production") {
    return { name: "Finanças", slug: "financas", androidPackage: "com.kabreu.finance", databaseName: "finance.db" };
  }
  if (appVariant === "dev") {
    return { name: "Finanças Dev", slug: "financas", androidPackage: "com.kabreu.finance.dev", databaseName: "finance-dev.db" };
  }
  throw new Error(`Unknown APP_VARIANT "${appVariant}" (expected "dev" or "production").`);
}
