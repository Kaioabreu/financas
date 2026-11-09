// Core: the official prices of the Tesouro Direto bonds (Tesouro Transparente, CKAN) for the
// estimate of the 12 months before the first read. The CSV is read as a stream, newest first,
// and only until the window is covered. A bond is matched by maturity + indexer + coupon.
export const TREASURY_PACKAGE_URL = "https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto";

export class TreasuryFailed extends Error {}

/** Prices by bond key ("<kind>|<maturity>"), each a list of [day, PU Base Manha] sorted by day. */
export type TreasuryPrices = Map<string, [string, number][]>;

type Kind = "selic" | "pre" | "pre-coupon" | "ipca" | "ipca-coupon" | "educa" | "renda";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const toIso = (br: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** The kind of bond a CSV "Tipo Titulo" names. */
function kindOfCsv(title: string): Kind | null {
  const t = norm(title);
  const coupon = t.includes("juros semestrais");
  if (t.includes("selic")) return "selic";
  if (t.includes("educa")) return "educa";
  if (t.includes("renda")) return "renda";
  if (t.includes("ipca")) return coupon ? "ipca-coupon" : "ipca";
  if (t.includes("prefixado")) return coupon ? "pre-coupon" : "pre";
  return null;
}

/** What the Pluggy bond says about itself: the kinds it can be (two when the coupon is unknown) and the maturity. */
export function treasuryRef(inv: { name?: string | null }, extra: any): { kinds: Kind[]; due: string } | null {
  const raw = extra?.dueDate;
  if (typeof raw !== "string" || raw.length < 10) return null;
  const due = raw.slice(0, 10);
  const name = norm(String(inv.name ?? ""));
  if (name.includes("educa")) return { kinds: ["educa"], due };
  if (name.includes("renda")) return { kinds: ["renda"], due };
  const type = norm(String(extra?.rateType ?? ""));
  const hasCoupon: boolean | null =
    typeof extra?.couponPayment?.hasCoupon === "boolean" ? extra.couponPayment.hasCoupon : name.includes("juros semestrais") ? true : null;
  if (type.includes("selic")) return { kinds: ["selic"], due };
  const base = type.includes("ipca") ? "ipca" : type === "" || type.includes("pre") ? "pre" : null;
  if (!base) return null;
  if (hasCoupon === null) return { kinds: [base, `${base}-coupon`], due };
  return { kinds: [hasCoupon ? `${base}-coupon` : base], due };
}

/** The price series of a bond, or null when no kind matches (or the coupon leaves two candidates). */
export function matchTreasury(prices: TreasuryPrices, ref: { kinds: Kind[]; due: string }): [string, number][] | null {
  const found = ref.kinds.map((k) => prices.get(`${k}|${ref.due}`)).filter((x): x is [string, number][] => Boolean(x));
  return found.length === 1 ? found[0]! : null;
}

/** PU on the last day at or before `day`; before the first price, the first one. */
function priceOn(series: [string, number][], day: string): number {
  let price = series[0]![1];
  for (const [d, p] of series) {
    if (d > day) break;
    price = p;
  }
  return price;
}

/**
 * The value of a bond day by day: quantity x PU, scaled so that the last day meets `target`.
 * With operations the quantity is rebuilt backwards from today's; without, it is what
 * `amountOriginal` bought on `purchaseDate`. Null when the bond lacks what it takes.
 */
export function treasuryPath(
  series: [string, number][],
  inv: { amountOriginal: number | null },
  extra: any,
  ops: { type: string; date: string; quantity: number | null }[],
  target: number,
  D: string,
  days: string[],
): Record<string, number> | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const sized = ops
    .filter((o) => (o.type === "BUY" || o.type === "SELL") && n(o.quantity) > 0)
    .map((o) => ({ date: o.date.slice(0, 10), qty: (o.type === "BUY" ? 1 : -1) * n(o.quantity) }));
  let qAt: (day: string) => number;
  if (sized.length > 0) {
    const qNow = n(extra?.quantity) > 0 ? n(extra.quantity) : sized.reduce((s, o) => s + o.qty, 0);
    qAt = (day) => Math.max(0, qNow - sized.filter((o) => o.date > day).reduce((s, o) => s + o.qty, 0));
  } else {
    const purchase = typeof extra?.purchaseDate === "string" ? extra.purchaseDate.slice(0, 10) : null;
    if (!purchase || !(n(inv.amountOriginal) > 0)) return null;
    const q = n(inv.amountOriginal) / priceOn(series, purchase);
    qAt = (day) => (day >= purchase ? q : 0);
  }
  const atD = qAt(D) * priceOn(series, D);
  if (!(atD > 0) || !(target > 0)) return null;
  const k = target / atD;
  return Object.fromEntries(days.map((day) => [day, qAt(day) * priceOn(series, day) * k]));
}

/** Resolves the CSV through the CKAN, reads it in a stream and keeps the rows of [from, to]. */
export async function loadTreasuryPrices(fetcher: typeof fetch, from: string, to: string): Promise<TreasuryPrices> {
  let url: string;
  try {
    const meta = await fetcher(TREASURY_PACKAGE_URL);
    if (meta.status !== 200) throw new TreasuryFailed();
    const resources: { url?: unknown; format?: unknown }[] = ((await meta.json()) as any)?.result?.resources ?? [];
    const csvs = resources.filter((r) => typeof r.url === "string" && (/\.csv$/i.test(r.url) || String(r.format).toUpperCase() === "CSV"));
    const pick = csvs.find((r) => /precotaxatesourodireto/i.test(String(r.url))) ?? csvs[0];
    if (!pick) throw new TreasuryFailed();
    url = pick.url as string;
  } catch {
    throw new TreasuryFailed();
  }

  const prices: TreasuryPrices = new Map();
  let cols: { type: number; due: number; base: number; pu: number } | null = null;
  let seenInside = false;
  let done = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const cells = line.split(";");
    if (!cols) {
      const at = (name: string) => cells.findIndex((c) => norm(c) === name);
      cols = { type: at("tipo titulo"), due: at("data vencimento"), base: at("data base"), pu: at("pu base manha") };
      if (Object.values(cols).some((i) => i < 0)) throw new TreasuryFailed();
      return;
    }
    const day = toIso(cells[cols.base] ?? "");
    if (!day) return;
    if (day < from) {
      if (seenInside) done = true; // newest first: everything after this is older
      return;
    }
    if (day > to) return;
    seenInside = true;
    const kind = kindOfCsv(cells[cols.type] ?? "");
    const due = toIso(cells[cols.due] ?? "");
    const pu = Number((cells[cols.pu] ?? "").trim().replace(/\./g, "").replace(",", "."));
    if (!kind || !due || !Number.isFinite(pu) || pu <= 0) return;
    const key = `${kind}|${due}`;
    const list = prices.get(key) ?? [];
    list.push([day, pu]);
    prices.set(key, list);
  };

  try {
    const response = await fetcher(url);
    if (response.status !== 200) throw new TreasuryFailed();
    let pending = "";
    const feed = (text: string) => {
      pending += text;
      let i: number;
      while (!done && (i = pending.indexOf("\n")) >= 0) {
        handle(pending.slice(0, i).replace(/\r$/, ""));
        pending = pending.slice(i + 1);
      }
    };
    const reader = response.body?.getReader();
    if (reader) {
      while (!done) {
        const { value, done: end } = await reader.read();
        if (end) break;
        let text = "";
        for (let i = 0; i < value.length; i++) text += String.fromCharCode(value[i]!); // Latin-1
        feed(text);
      }
      if (done) await reader.cancel().catch(() => {});
      else feed("\n");
    } else {
      feed((await response.text()) + "\n");
    }
  } catch {
    throw new TreasuryFailed();
  }
  if (!cols) throw new TreasuryFailed();
  for (const list of prices.values()) list.sort(([a], [b]) => a.localeCompare(b));
  return prices;
}
