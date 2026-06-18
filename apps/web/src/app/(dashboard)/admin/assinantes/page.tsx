'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ShieldAlert,
  Users,
  TrendingUp,
  TrendingDown,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';

interface MeResponse {
  user: { isSuperAdmin?: boolean };
}

type SubStatus = 'pending' | 'active' | 'past_due' | 'cancelled';

interface Subscriber {
  id: string;
  name: string;
  slug: string;
  tenantStatus: string; // active | suspended
  isSelf: boolean;
  owner: { email: string; fullName: string | null } | null;
  createdAt: string;
  subscription: {
    status: SubStatus;
    amount: number;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    payerEmail: string;
    updatedAt: string;
  } | null;
}

interface SubscribersResponse {
  subscribers: Subscriber[];
  revenue: { mrr: number; lostMrr: number; pendingMrr: number };
  counts: {
    total: number;
    active: number;
    pastDue: number;
    cancelled: number;
    pending: number;
    noSubscription: number;
  };
}

function brl(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SUB_BADGE: Record<SubStatus | 'none', { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  past_due: { label: 'Atrasada', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  pending: { label: 'Pendente', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
  none: { label: 'Sem assinatura', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400' },
};

function MetricCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'good' | 'bad';
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 text-ink-muted text-xs uppercase tracking-wider">
        <span
          className={cn(
            'inline-flex items-center justify-center w-7 h-7 rounded-lg',
            tone === 'good' && 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
            tone === 'bad' && 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
            tone === 'default' && 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300',
          )}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="text-2xl font-bold text-ink mt-2 num-tabular">{value}</div>
      {hint && <div className="text-xs text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

export default function AssinantesPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/me') });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-subscribers'],
    queryFn: () => api<SubscribersResponse>('/admin/subscribers'),
    enabled: !!me.data?.user.isSuperAdmin,
  });

  const patch = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      api(`/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-subscribers'] });
      qc.invalidateQueries({ queryKey: ['admin-tenants'] });
      toast.success('Acesso atualizado');
    },
    onError: (err: Error) => toast.error('Não foi possível atualizar', err.message),
  });

  if (me.isLoading) {
    return <div className="p-6 text-ink-muted">Verificando permissões…</div>;
  }

  if (!me.data?.user.isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto bg-amber-50 border border-amber-300 rounded-lg p-6 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
          <h2 className="font-semibold text-amber-900">Acesso restrito</h2>
          <p className="text-sm text-amber-900">
            Esta página é exclusiva pra super admins do sistema.
          </p>
          <button
            onClick={() => router.push('/painel')}
            className="text-sm text-amber-900 hover:underline"
          >
            ← Voltar pro dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <header className="mb-6">
        <Link
          href="/painel"
          className="text-sm text-ink-muted hover:text-ink flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </Link>
        <h1 className="text-2xl font-bold">Assinantes</h1>
        <p className="text-ink-muted text-sm">
          Receita recorrente, status das assinaturas e controle de acesso de cada pousada.
        </p>
      </header>

      {isLoading && <div className="text-sm text-ink-muted">Carregando…</div>}

      {data && (
        <>
          {/* Métricas de faturamento */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <MetricCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="MRR ativo"
              value={brl(data.revenue.mrr)}
              hint={`${data.counts.active} assinatura(s) ativa(s)`}
              tone="good"
            />
            <MetricCard
              icon={<Users className="w-4 h-4" />}
              label="Pousadas"
              value={String(data.counts.total)}
              hint={`${data.counts.pending + data.counts.noSubscription} sem assinatura ativa`}
            />
            <MetricCard
              icon={<AlertTriangle className="w-4 h-4" />}
              label="Atrasadas"
              value={String(data.counts.pastDue)}
              hint={data.revenue.pendingMrr > 0 ? `${brl(data.revenue.pendingMrr)} em risco` : 'em dia'}
            />
            <MetricCard
              icon={<TrendingDown className="w-4 h-4" />}
              label="Canceladas"
              value={String(data.counts.cancelled)}
              hint={`${brl(data.revenue.lostMrr)}/mês perdidos`}
              tone="bad"
            />
          </div>

          {/* Tabela de assinantes */}
          <div className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
                  <tr>
                    <th className="text-left p-3 font-semibold">Pousada</th>
                    <th className="text-left p-3 font-semibold">Pagador</th>
                    <th className="text-left p-3 font-semibold">Assinatura</th>
                    <th className="text-left p-3 font-semibold">Valor</th>
                    <th className="text-left p-3 font-semibold">Vence em</th>
                    <th className="text-left p-3 font-semibold">Acesso</th>
                    <th className="text-right p-3 font-semibold w-16">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subscribers.map((s, idx) => {
                    const subStatus = s.subscription?.status ?? 'none';
                    const badge = SUB_BADGE[subStatus];
                    const churned = subStatus === 'cancelled' || subStatus === 'past_due';
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          'border-b border-line-soft last:border-0',
                          idx % 2 === 1 && 'bg-surface-sunken/20',
                          churned && 'bg-red-50/50 dark:bg-red-950/10',
                        )}
                      >
                        <td className="p-3">
                          <div className="font-medium text-ink flex items-center gap-1.5">
                            {s.name}
                            {s.isSelf && (
                              <span className="text-[9px] uppercase tracking-wider text-brand-600 bg-brand-100 dark:bg-brand-900/40 px-1.5 py-0.5 rounded">
                                você
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-ink-muted font-mono">{s.slug}</div>
                        </td>
                        <td className="p-3 text-ink-soft">
                          <div className="text-xs">{s.subscription?.payerEmail ?? s.owner?.email ?? '—'}</div>
                          {s.owner?.fullName && (
                            <div className="text-[11px] text-ink-muted">{s.owner.fullName}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', badge.cls)}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-3 text-ink-soft num-tabular">
                          {s.subscription ? `${brl(s.subscription.amount)}/mês` : '—'}
                        </td>
                        <td className="p-3 text-ink-soft text-xs num-tabular">
                          {fmtDate(s.subscription?.currentPeriodEnd)}
                        </td>
                        <td className="p-3">
                          <span
                            className={cn(
                              'text-xs px-2 py-0.5 rounded-full font-medium',
                              s.tenantStatus === 'active'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
                            )}
                          >
                            {s.tenantStatus === 'active' ? 'Liberado' : 'Bloqueado'}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center justify-end">
                            <button
                              onClick={() => {
                                const blocking = s.tenantStatus === 'active';
                                if (
                                  blocking &&
                                  !window.confirm(
                                    `Bloquear "${s.name}"?\n\nIsto CANCELA a cobrança recorrente no Mercado Pago (definitivo) e bloqueia o acesso. ` +
                                      `Para voltar a cobrar, o cliente precisará assinar novamente.`,
                                  )
                                )
                                  return;
                                patch.mutate({ id: s.id, status: blocking ? 'suspended' : 'active' });
                              }}
                              disabled={patch.isPending || s.isSelf}
                              data-tip={
                                s.isSelf
                                  ? 'Não dá pra bloquear a sua própria pousada'
                                  : s.tenantStatus === 'active'
                                    ? 'Bloquear acesso (suspende logins)'
                                    : 'Liberar acesso'
                              }
                              className="p-1.5 text-ink-muted hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md active:scale-95 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              {s.tenantStatus === 'active' ? (
                                <PauseCircle className="w-4 h-4" />
                              ) : (
                                <PlayCircle className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {data.subscribers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-ink-muted text-sm">
                        Nenhuma pousada cadastrada ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-ink-muted mt-3">
            Quando uma assinatura é cancelada no Mercado Pago, o acesso da pousada é bloqueado
            automaticamente. Aqui você também pode bloquear ou liberar manualmente.
          </p>
        </>
      )}
    </div>
  );
}
