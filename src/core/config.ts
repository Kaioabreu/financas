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
  /** A full read that would delete more than this share of a product deletes nothing. */
  mirrorDeleteLimit: number;
  /** Extra attempts per request (so 3 in all). */
  requestRetries: number;
  /** Wait between attempts after a network error or a 5xx. */
  retryDelayMs: number;
  /** Longest Retry-After the core honours on a 429. */
  maxRetryAfterMs: number;
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
};
