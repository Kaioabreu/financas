// Core: the state of a Connection (atrasada, a reconectar) and the Resumo's one notice.
import { appMeta, connection } from "../db/schema";

export const STALE_MS = 48 * 3_600_000;
export const SNOOZE_MS = 30 * 86_400_000;
export const REFUSED_KEY = "credentials.refused";

export type StatusKind = "late" | "reconnect";
export type CauseCode = "expired" | "login-error" | "not-found" | "pluggy-outdated" | "lock" | "app-unreadable";
export interface ConnectionStatus {
  kind: StatusKind;
  /** "Sem dados novos desde 03/11", or "Investimentos do BTG sem dados novos desde 03/11". */
  headline: string;
  cause: string;
  causeCode: CauseCode;
  /** "reconnect" -> Reconectar; "open-meu-pluggy" -> Abrir o Meu Pluggy. */
  primaryAction: "reconnect" | "open-meu-pluggy" | null;
  secondaryAction: "reconnect" | null;
}

type Row = typeof connection.$inferSelect;

const day = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
export const dayLabel = (iso: string | null) => (iso ? day(iso) : null);

const GROUP: Record<string, { label: string; lower: string }> = {
  accounts: { label: "Contas", lower: "as contas" },
  transactions: { label: "Contas", lower: "as contas" },
  creditCards: { label: "Cartões", lower: "os cartões" },
  investments: { label: "Investimentos", lower: "os investimentos" },
  investmentsTransactions: { label: "Investimentos", lower: "os investimentos" },
};

export function deriveStatus(row: Row, now: number, expired: boolean, refused: boolean): ConnectionStatus | null {
  const since = row.dataAt;
  const bank = row.bankName;
  const reconnectCause: { code: CauseCode; text: string } | null = expired
    ? { code: "expired", text: "A conexão venceu" }
    : row.reconnectReason === "login-error"
      ? { code: "login-error", text: "O banco pediu um novo login" }
      : row.reconnectReason === "not-found"
        ? { code: "not-found", text: "O Meu Pluggy não encontrou mais esta conexão" }
        : null;
  const plain = since ? `Sem dados novos desde ${day(since)}` : "Sem dados ainda";
  if (reconnectCause) {
    return { kind: "reconnect", headline: plain, cause: reconnectCause.text, causeCode: reconnectCause.code, primaryAction: "reconnect", secondaryAction: null };
  }
  // Rejected credentials stop the 48 h clock: nothing can be read, and it is not the bank's fault.
  if (refused || !since || now - Date.parse(since) <= STALE_MS) return null;

  const dates: Record<string, string> = row.productDates ? JSON.parse(row.productDates) : {};
  const dated = Object.entries(dates).filter(([name, date]) => GROUP[name] && date);
  const stalled = dated.filter(([, date]) => now - Date.parse(date) > STALE_MS);
  const datedGroups = new Set(dated.map(([name]) => GROUP[name]!.label));
  const stalledGroups = [...new Set(stalled.map(([name]) => GROUP[name]!.label))];
  const named = stalled.length > 0 && stalledGroups.length < datedGroups.size;
  const oldest = stalled.map(([, date]) => date).sort()[0] ?? since;
  const headline = named ? `${stalledGroups.join(" e ")} do ${bank} sem dados novos desde ${day(oldest)}` : plain;

  const pluggyOld =
    row.pluggyStatus === "OUTDATED" ||
    row.pluggyExecution === "PARTIAL_SUCCESS" ||
    (row.pluggyUpdatedAt !== null && now - Date.parse(row.pluggyUpdatedAt) > STALE_MS);
  if (pluggyOld) {
    return {
      kind: "late",
      headline,
      cause: named ? `O Meu Pluggy não atualiza ${[...new Set(stalled.map(([n]) => GROUP[n]!.lower))].join(" e ")} do ${bank}` : `O Meu Pluggy não atualiza o ${bank}`,
      causeCode: "pluggy-outdated",
      primaryAction: "open-meu-pluggy",
      secondaryAction: "reconnect",
    };
  }
  return {
    kind: "late",
    headline,
    cause: row.lockTriggered ? `O app guardou a última leitura do ${bank} por segurança` : `O app não consegue ler o ${bank}`,
    causeCode: row.lockTriggered ? "lock" : "app-unreadable",
    primaryAction: null,
    secondaryAction: "reconnect",
  };
}

// ---- The Resumo's notice ----

export type NoticeKind = "credentials" | "reconnect" | "late" | "expiring" | "backup";
export interface Notice {
  /** Stable key, used to snooze. */
  key: string;
  kind: NoticeKind;
  text: string;
  itemId?: string;
  /** What a tap does. */
  action: "update-secret" | "reconnect" | "open-connections" | "renew" | "backup";
  snoozable: boolean;
}
export interface NoticeQueue {
  shown: Notice | null;
  /** How many more notices wait behind the shown one ("e mais N"). */
  more: number;
}
export interface NoticeSource {
  itemId: string;
  bankName: string;
  state: string;
  daysLeft: number | null;
  status: ConnectionStatus | null;
}

const RANK: Record<NoticeKind, number> = { credentials: 0, reconnect: 1, late: 2, expiring: 3, backup: 4 };

export const BACKUP_MAX_AGE_MS = 30 * 86_400_000;

/** The Backup reminder: never made (once something was synced) or older than 30 days. */
export function backupNotice(lastBackupAt: string | null, synced: boolean, now: number): Notice | null {
  const base = { key: "backup", kind: "backup", action: "backup", snoozable: true } as const;
  if (!lastBackupAt) return synced ? { ...base, text: "Você ainda não fez um backup · Fazer backup" } : null;
  const age = now - Date.parse(lastBackupAt);
  if (age <= BACKUP_MAX_AGE_MS) return null;
  return { ...base, text: `Seu último backup tem ${Math.floor(age / 86_400_000)} dias · Fazer backup` };
}

export function buildNotices(
  refused: boolean,
  sources: NoticeSource[],
  snoozedUntil: (key: string) => number,
  now: number,
  backup: Notice | null = null,
): NoticeQueue {
  const all: Notice[] = [];
  if (refused) {
    all.push({ key: "credentials", kind: "credentials", text: "O Pluggy recusou suas credenciais · Atualizar Client Secret", action: "update-secret", snoozable: false });
  }
  for (const s of sources) {
    if (s.status?.kind === "reconnect") {
      all.push({ key: `reconnect:${s.itemId}`, kind: "reconnect", itemId: s.itemId, text: `A conexão com o ${s.bankName} precisa de um novo login · Reconectar`, action: "reconnect", snoozable: true });
    } else if (s.status?.kind === "late") {
      const subject = s.status.headline.includes(" do ") ? s.status.headline : `${s.bankName} ${s.status.headline.charAt(0).toLowerCase()}${s.status.headline.slice(1)}`;
      all.push({ key: `late:${s.itemId}`, kind: "late", itemId: s.itemId, text: `${subject} · Ver`, action: "open-connections", snoozable: true });
    } else if (s.state === "expiring") {
      const n = Math.max(s.daysLeft ?? 0, 0);
      all.push({ key: `expiring:${s.itemId}`, kind: "expiring", itemId: s.itemId, text: `A conexão com o ${s.bankName} vence em ${n} ${n === 1 ? "dia" : "dias"} · Renovar`, action: "renew", snoozable: true });
    }
  }
  if (backup) all.push(backup);
  const open = all
    .filter((n) => snoozedUntil(n.key) <= now)
    .map((n, i) => ({ n, i }))
    .sort((a, b) => RANK[a.n.kind] - RANK[b.n.kind] || a.i - b.i)
    .map(({ n }) => n);
  return { shown: open[0] ?? null, more: Math.max(open.length - 1, 0) };
}

export const snoozeKey = (key: string) => `snooze:${key}`;
export async function readSnoozes(db: { select: any }): Promise<Map<string, number>> {
  const rows = (await db.select().from(appMeta)) as { key: string; value: string }[];
  return new Map(rows.filter((r) => r.key.startsWith("snooze:")).map((r) => [r.key.slice(7), Number(r.value)]));
}
