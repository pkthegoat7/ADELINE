/** Serializa uma tabela em CSV (RFC-4180-ish). Sem dependência externa. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    // Anti formula-injection: célula de TEXTO iniciada por =,+,-,@,tab,CR vira
    // fórmula no Excel/Sheets/LibreOffice. Prefixa com apóstrofo pra forçar texto.
    // Só vale p/ strings — números (ex.: saldo negativo -10) seguem intactos.
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  return lines.join('\n');
}
