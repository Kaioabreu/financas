// Embedded configuration: limits and constants shipped with the app.
export interface EmbeddedConfig {
  pluggyBaseUrl: string;
  /** Pluggy apiKey lifetime (2 h). */
  apiKeyTtlMs: number;
  guideUrl: string;
}

export const embeddedConfig: EmbeddedConfig = {
  pluggyBaseUrl: "https://api.pluggy.ai",
  apiKeyTtlMs: 2 * 60 * 60 * 1000,
  guideUrl: "https://github.com/Kaioabreu/financas/blob/main/docs/guia-de-entrada.md",
};
