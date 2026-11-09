// Core: when is a card bill taken as paid. One rule, shared by the live debt (networth.ts)
// and the estimated curve (estimate.ts), so the two never disagree.
//   - payments reported and they cover the total: paid.
//   - payments reported but short: not paid (a partial payment is still owed).
//   - no payments info (absent or an empty list): Pluggy does not say, so a bill past its
//     due date is taken as paid; one not yet due is not.
// A purchase whose billId is not among the stored bills is not owed by default.

interface BillLike {
  id: string;
  dueDate: string;
  totalAmount: number | null;
  extra: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function payments(b: BillLike): unknown[] | null {
  try {
    const p = (b.extra ? JSON.parse(b.extra) : {}).payments;
    return Array.isArray(p) && p.length > 0 ? p : null;
  } catch {
    return null;
  }
}

/**
 * True when the bill counts as paid at the end of `day` (YYYY-MM-DD). The payment date is unknown,
 * so a bill whose payments cover it counts from its due date in the estimated curve; the live
 * debt (`today: true`) takes it as paid right away (it may have been paid early).
 */
export function billPaidOn(b: BillLike, day: string, today = false): boolean {
  const due = b.dueDate.slice(0, 10);
  const list = payments(b);
  if (!list) return due < day;
  const sum = list.reduce<number>((s, p) => s + num((p as { amount?: unknown })?.amount), 0);
  const covered = sum > 0 && sum >= num(b.totalAmount) - 0.005;
  return covered && (today || due <= day);
}

/** A purchase may be owed unless its bill is unknown. No billId means the open bill: owed. */
export function billKnown(billId: string | null | undefined, bills: BillLike[]): boolean {
  return !billId || bills.some((b) => b.id === billId);
}
