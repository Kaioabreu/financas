/**
 * PROTOTYPE (branch prototype/transacoes-linhas): tidy titles for the Transações list.
 * Pure: the description and the sign of the amount in, a short title and a kind out.
 */
export type PixKind = "pix-sent" | "pix-received" | "pix-qr" | "pix-refund" | "pix" | "boleto" | "other";
export type NameStyle = "initial" | "full";
export interface PixLabel {
  title: string;
  kind: PixKind;
  /** The shortened name (person or business), when the description carried one. */
  name?: string;
  /** The description exactly as the bank sent it, for the detail view. */
  original: string;
}

const PARTICLES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);
const LEGAL = new Set(["ltda", "ltda.", "me", "mei", "epp", "eireli", "sa", "s.a.", "s/a", "s.a", "ss", "cia"]);

function titleCase(word: string): string {
  const lower = word.toLocaleLowerCase("pt-BR");
  if (PARTICLES.has(lower)) return lower;
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

function words(raw: string): string[] {
  return raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
}

/** A person: first name plus last initial ("Ana S.") or last name ("Ana Souza"). */
export function shortPerson(raw: string, style: NameStyle): string {
  const parts = words(raw);
  if (parts.length === 0) return "";
  const first = titleCase(parts[0]!);
  const rest = parts.slice(1).filter((p) => !PARTICLES.has(p.toLocaleLowerCase("pt-BR")));
  if (rest.length === 0) return first;
  const last = titleCase(rest[rest.length - 1]!);
  return style === "initial" ? `${first} ${last.charAt(0)}.` : `${first} ${last}`;
}

/** A business: legal suffixes, tax ids and trailing words dropped, at most two words. */
export function shortBusiness(raw: string): string {
  const parts = words(raw).filter((p) => !LEGAL.has(p.toLocaleLowerCase("pt-BR")) && !/^[\d./-]{5,}$/.test(p));
  const kept = parts.slice(0, 2);
  return kept.map(titleCase).join(" ");
}

const clean = (s: string) => s.replace(/^[\s|:-]+/, "").trim();

export function pixLabel(description: string, amount: number, opts: { style?: NameStyle } = {}): PixLabel {
  const style = opts.style ?? "initial";
  const original = description;
  const d = description.replace(/\s+/g, " ").trim();
  const make = (kind: PixKind, prefix: string, name?: string): PixLabel => ({
    title: name ? `${prefix} ${name}` : prefix,
    kind,
    ...(name ? { name } : {}),
    original,
  });
  const person = (s: string) => shortPerson(clean(s), style);
  let m: RegExpMatchArray | null;

  if ((m = d.match(/^devolu[cç][aã]o de pix(?: enviado| recebido)?(.*)$/i))) {
    const name = person(m[1]!);
    return make("pix-refund", name ? "Devolução ·" : "Devolução de Pix", name || undefined);
  }
  if ((m = d.match(/^pagamento com qr pix(.*)$/i))) {
    const name = shortBusiness(clean(m[1]!));
    return make("pix-qr", name ? "Pix QR ·" : "Pix QR", name || undefined);
  }
  if ((m = d.match(/^transfer[eê]ncia enviada pelo pix(.*)$/i)) || (m = d.match(/^pix enviado(.*)$/i))) {
    const name = person(m[1]!);
    return make("pix-sent", name ? "Pix para" : "Pix enviado", name || undefined);
  }
  if ((m = d.match(/^transfer[eê]ncia recebida(?: pelo pix)?(.*)$/i)) || (m = d.match(/^pix recebido(.*)$/i))) {
    const name = person(m[1]!);
    return make("pix-received", name ? "Pix de" : "Pix recebido", name || undefined);
  }
  if (/^pix$/i.test(d)) {
    return amount < 0 ? make("pix-sent", "Pix enviado") : make("pix-received", "Pix recebido");
  }
  if ((m = d.match(/^pagamento efetuado(.*)$/i))) {
    const name = shortBusiness(clean(m[1]!));
    return make("boleto", name ? "Boleto ·" : "Boleto", name || undefined);
  }
  // Everything else: only a light cleanup (digits-only prefixes, stray spaces).
  const tidy = d.replace(/^(?:\d[\d./-]*\s+)+(?=\S)/, "");
  return { title: tidy || d, kind: "other", original };
}
