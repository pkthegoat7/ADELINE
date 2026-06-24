'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

const brl = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n || 0));
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

interface Payable {
  id: string;
  dueDate: string;
  description: string;
  amount: number;
}
interface PayablesBuckets {
  overdue: Payable[];
  today: Payable[];
  upcoming: Payable[];
  counts: { overdue: number; today: number; upcoming: number };
  totals: { overdue: number; today: number; upcoming: number };
}

export function PayablesDueCard() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['payables-due'],
    queryFn: () => api<PayablesBuckets>('/reports/payables-due?days=7'),
  });
  const pay = useMutation({
    mutationFn: (id: string) =>
      api(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payables-due'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast.success('Despesa marcada como paga.');
    },
    onError: (e) => toast.error('Não foi possível marcar como paga.', String((e as Error).message)),
  });

  if (!data) return null;
  const items = [...data.overdue, ...data.today, ...data.upcoming];
  if (items.length === 0) return null;

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-serif text-lg text-ink">Contas a vencer</h3>
        <span className="text-xs text-ink-muted">
          {data.counts.overdue > 0 && (
            <span className="text-red-600">{data.counts.overdue} vencida(s) · </span>
          )}
          {data.counts.today} hoje · {data.counts.upcoming} em 7 dias
        </span>
      </div>
      <ul className="divide-y divide-line">
        {items.map((e) => {
          const overdue = e.dueDate < todayIso;
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-ink truncate">{e.description}</p>
                <p className={`text-xs ${overdue ? 'text-red-600' : 'text-ink-muted'}`}>
                  vence {fmtDate(e.dueDate)} · {brl(e.amount)}
                </p>
              </div>
              <button
                onClick={() => pay.mutate(e.id)}
                disabled={pay.isPending}
                className="btn-secondary text-xs shrink-0"
              >
                Marcar pago
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
