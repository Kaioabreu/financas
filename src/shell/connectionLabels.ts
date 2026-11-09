import type { ConnectionSummary } from "../core/connections";

const two = (n: number) => String(n).padStart(2, "0");
const day = (d: Date) => `${two(d.getDate())}/${two(d.getMonth() + 1)}`;

/** "hoje, 06:12", "ontem, 06:12" or "03/11, 06:12". */
export function readTime(iso: string | null, now = new Date()): string {
  if (!iso) return "ainda não lido";
  const at = new Date(iso);
  const clock = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(at)) / 86_400_000);
  return `${diff === 0 ? "hoje" : diff === 1 ? "ontem" : day(at)}, ${clock}`;
}

export function expiryText(c: ConnectionSummary): string {
  if (!c.consentExpiresAt) return "Sem data de vencimento";
  const d = new Date(c.consentExpiresAt);
  const full = `${day(d)}/${d.getFullYear()}`;
  return c.status?.causeCode === "expired" ? `Venceu em ${full}` : `Vence em ${full}`;
}

/** The status label and whether it asks for attention. */
export function stateLabel(c: ConnectionSummary): { text: string; attention: boolean } {
  if (c.state === "reconnect") return { text: "Conexão a reconectar", attention: true };
  if (c.state === "late") return { text: "Conexão atrasada", attention: true };
  if (c.state === "reading") return { text: "Lendo…", attention: false };
  if (c.state === "expiring") {
    const n = Math.max(c.daysLeft ?? 0, 0);
    return { text: n === 1 ? "Vence em 1 dia" : `Vence em ${n} dias`, attention: true };
  }
  return { text: "Em dia", attention: false };
}

/** "BTG, Nubank e Mercado Pago". */
export function bankNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
