// Embedded configuration: limits and constants shipped with the app.
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
}

export const embeddedConfig: EmbeddedConfig = {
  pluggyBaseUrl: "https://api.pluggy.ai",
  apiKeyTtlMs: 2 * 60 * 60 * 1000,
  guideUrl: "https://github.com/Kaioabreu/financas/blob/main/docs/guia-de-entrada.md",
  meuPluggyConnectorId: 200,
  pollIntervalMs: 3_000,
  authorizationTimeoutMs: 4 * 60 * 1000,
  tabClosedGraceMs: 5_000,
};
