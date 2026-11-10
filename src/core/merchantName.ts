import type { MerchantAlias } from "./config";

/** Same length as the input, so an index found in the folded text is valid in the original. */
const fold = (s: string) => s.replace(/[\u00c0-\u017f]/g, (ch) => ch.normalize("NFD")[0]!).toLowerCase();

/** Acquirer and marketplace prefixes ("EC *", "PAG*", "MP *"...). */
const PREFIX = /^\s*(?:ec|pag|pg|mp|zp|iz|sumup|pagseguro|picpay|stone|cielo)\s*\*\s*/i;

/** A city glued to the name, with the country code after it ("SAO PAULOBRA", "Brsão Paulobra", "Rio De Janeirbra"). */
const CITY =
  /\s*(?:br)?(?:s?ao paulo|rio de janeir[o]?|belo horizont[e]?|brasilia|curitiba|porto alegre|salvador|fortaleza|recife|campinas|guarulhos|barueri|osasco)\s*(?:br[a]?)?(?:\s*(?:usa?))?\s*$/;

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e"]);

function titleCase(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  if (PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/**
 * The short name shown for a merchant. Pure: the bank's raw text and the alias list in, a name out.
 * A known merchant gets its alias; an unknown one is cleaned by heuristics. The result is never empty
 * unless the input is blank.
 */
export function cleanMerchantName(raw: string, aliases: MerchantAlias[]): string {
  const original = raw.replace(/\s+/g, " ").trim();
  if (!original) return "";
  let text = original.replace(PREFIX, "");
  const alias = findAlias(text, aliases);
  if (alias) return alias;

  // The text after a star is an order id or a store code.
  const star = text.indexOf("*");
  if (star >= 3) text = text.slice(0, star);

  const folded = fold(text);
  const city = CITY.exec(folded);
  if (city && city.index > 0) {
    text = text.slice(0, city.index);
    text = text.replace(/[\s.]us$/i, "");
  }

  const words = text
    .split(" ")
    .filter((w) => w && !/\d{4,}/.test(w));
  const cleaned = words.join(" ").replace(/[\s*.\-|]+$/, "").trim();
  if (!cleaned) return original;
  const hasLower = /\p{Ll}/u.test(cleaned);
  return hasLower ? cleaned : cleaned.split(" ").map(titleCase).join(" ");
}

function findAlias(text: string, aliases: MerchantAlias[]): string | undefined {
  const folded = fold(text);
  for (const a of aliases) {
    const key = fold(a.contains);
    if (key && folded.startsWith(key) && !/\d/.test(folded.charAt(key.length))) return a.name;
  }
  return undefined;
}
