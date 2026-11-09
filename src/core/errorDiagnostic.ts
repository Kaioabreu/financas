// Core: the text "Copiar diagnóstico" copies on the error screen. An Error's message and stack can carry
// SQL with its parameters (descriptions, amounts, CPF, Client ID), so neither enters the copied text:
// only the error's class name and where in the app's own code it was thrown (file:line, no values).

const APP_FRAME = /(?:\bat\s+)?(?:[\w$.<>\s]*?\()?[^\s()]*?((?:src|app)[\\/][\w./\\-]+\.(?:tsx?|jsx?)):(\d+)/;

/** Error name plus the first app-code frame of the stack, e.g. "DrizzleQueryError em src/core/sync.ts:120". */
export function errorLocation(error: { name?: string; stack?: string }): string {
  const name = /^[A-Za-z][\w$]*$/.test(error.name ?? "") ? error.name! : "Error";
  for (const line of (error.stack ?? "").split("\n")) {
    const m = APP_FRAME.exec(line);
    if (m) return `${name} em ${m[1]!.replaceAll("\\", "/")}:${m[2]}`;
  }
  return name;
}

export const copyableDiagnostic = (diagnostic: string, error: { name?: string; stack?: string }) =>
  `${diagnostic}\n\nErro: ${errorLocation(error)}`;
