// Core: the Backup file name. The day is the user's local day, not UTC.
import { localDay } from "./networth";

/** financas-backup-AAAA-MM-DD.financas */
export const backupFileName = (now: number) => `financas-backup-${localDay(now)}.financas`;
