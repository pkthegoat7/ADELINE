/** Campos financeiros do summary do dashboard, redigidos p/ papéis sem expense:read. */
export interface DashboardFinancials {
  monthRevenue: { value: number; reservationCount: number } | null;
  adr: number | null;
  revPar: number | null;
}

/**
 * Redige (zera p/ null) os campos financeiros do summary quando o usuário
 * não tem permissão de ver financeiro. Função pura — não muta a entrada.
 */
export function redactFinancials<T extends DashboardFinancials>(
  summary: T,
  canSeeFinancials: boolean,
): T {
  if (canSeeFinancials) return summary;
  return { ...summary, monthRevenue: null, adr: null, revPar: null };
}
