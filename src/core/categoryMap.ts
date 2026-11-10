// Core: Pluggy category -> app category. Pure; the tables live in the EmbeddedConfig (OTA-updatable).
import type { AppCategory } from "./classification";
import { normalizeText } from "./classification";
import type { EmbeddedConfig } from "./config";

/**
 * The app category of a Pluggy category. The 8-digit id wins: the longest prefix of it that the
 * config knows (a leaf, a subgroup or the 2-digit group). Without a known id, the normalized name.
 * Undefined when neither is known (the caller falls back to Outros).
 */
export function mapPluggyCategory(
  config: Pick<EmbeddedConfig, "categoryMap" | "categoryIdMap">,
  name: string | null | undefined,
  categoryId: string | null | undefined,
): AppCategory | undefined {
  const id = (categoryId ?? "").replace(/\D/g, "").replace(/0+$/, "");
  for (let len = Math.max(id.length, 2); len >= 2; len--) {
    const hit = config.categoryIdMap[id.slice(0, len).padEnd(2, "0")];
    if (hit) return hit;
  }
  return name ? config.categoryMap[normalizeText(name)] : undefined;
}
