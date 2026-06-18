'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { toast } from '@/lib/toast';

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'utilities_water', label: 'Água' },
  { value: 'utilities_power', label: 'Energia' },
  { value: 'utilities_internet', label: 'Internet/Telefonia' },
  { value: 'cleaning', label: 'Limpeza' },
  { value: 'maintenance', label: 'Manutenção' },
  { value: 'salaries', label: 'Salários/Pessoal' },
  { value: 'taxes', label: 'Impostos/Taxas' },
  { value: 'supplies', label: 'Suprimentos' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'software', label: 'Sistemas/Assinaturas' },
  { value: 'rent', label: 'Aluguel' },
  { value: 'other', label: 'Outros' },
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

interface Expense {
  id: string;
  propertyId: string | null;
  property: { id: string; name: string } | null;
  category: string;
  description: string;
  supplier: string | null;
  amount: string; // Decimal serializado como string
  date: string;
  status: 'pending' | 'paid';
  dueDate: string | null;
  paidAt: string | null;
  receiptUrl: string | null;
}
interface Summary {
  total: number;
  paid: number;
  pending: number;
  byCategory: { category: string; amount: number }[];
}
interface Property {
  id: string;
  name: string;
}

const brl = (v: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');

export default function DespesasPage() {
  const qc = useQueryClient();
  const can = useCan();
  const editable = can('expense:manage');

  const [filters, setFilters] = useState({ propertyId: '', category: '', status: '', from: '', to: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => api<Property[]>('/properties'),
  });
  const { data: list, isLoading } = useQuery({
    queryKey: ['expenses', qs],
    queryFn: () => api<Expense[]>(`/expenses${qs ? `?${qs}` : ''}`),
  });
  const { data: summary } = useQuery({
    queryKey: ['expenses-summary', qs],
    queryFn: () => api<Summary>(`/expenses/summary${qs ? `?${qs}` : ''}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expenses-summary'] });
  };

  const remove = useMutation({
    mutationFn: (id: string) => api(`/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      toast.success('Despesa excluída');
    },
    onError: (e: Error) => toast.error('Não foi possível excluir', e.message),
  });
  const markPaid = useMutation({
    mutationFn: (id: string) =>
      api(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) }),
    onSuccess: () => {
      invalidate();
      toast.success('Marcada como paga');
    },
    onError: (e: Error) => toast.error('Falhou', e.message),
  });

  const isOverdue = (e: Expense) => e.status === 'pending' && e.dueDate && new Date(e.dueDate) < new Date();

  const propertyOptions = [
    { value: '', label: 'Todas as propriedades' },
    ...(properties?.map((p) => ({ value: p.id, label: p.name })) ?? []),
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Financeiro</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Despesas</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">{list?.length ?? 0} lançamentos</p>
        </div>
        {editable && (
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Nova despesa
          </button>
        )}
      </header>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Total no período" value={summary?.total ?? 0} />
        <SummaryCard label="Pago" value={summary?.paid ?? 0} tone="emerald" />
        <SummaryCard label="A pagar" value={summary?.pending ?? 0} tone="amber" />
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Select
          value={filters.propertyId}
          onChange={(v) => setFilters((f) => ({ ...f, propertyId: v }))}
          options={propertyOptions}
        />
        <Select
          value={filters.category}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          options={[{ value: '', label: 'Todas as categorias' }, ...CATEGORIES]}
        />
        <Select
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={[
            { value: '', label: 'Todos os status' },
            { value: 'pending', label: 'A pagar' },
            { value: 'paid', label: 'Pago' },
          ]}
        />
        <input
          type="date"
          className="input-base"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <input
          type="date"
          className="input-base"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
      </div>

      {/* Tabela */}
      {isLoading ? (
        <SkeletonTable />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted border-b border-line">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Propriedade</th>
                <th className="px-3 py-2 font-medium">Categoria</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium">Vencimento</th>
                <th className="px-3 py-2 font-medium text-right">Valor</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {editable && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {list?.length ? (
                list.map((e) => (
                  <tr key={e.id} className="border-b border-line/60 hover:bg-surface-2/40">
                    <td className="px-3 py-2 num-tabular">{fmtDate(e.date)}</td>
                    <td className="px-3 py-2">{e.property?.name ?? <span className="text-ink-muted">Geral</span>}</td>
                    <td className="px-3 py-2">{CAT_LABEL[e.category] ?? e.category}</td>
                    <td className="px-3 py-2">
                      {e.description}
                      {e.supplier && <span className="text-ink-muted"> · {e.supplier}</span>}
                      {e.receiptUrl && (
                        <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-emerald-600 ml-1">
                          comprovante
                        </a>
                      )}
                    </td>
                    <td className={`px-3 py-2 num-tabular ${isOverdue(e) ? 'text-red-600 font-medium' : ''}`}>
                      {fmtDate(e.dueDate)}
                    </td>
                    <td className="px-3 py-2 text-right num-tabular">{brl(e.amount)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          e.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : isOverdue(e)
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {e.status === 'paid' ? 'Pago' : isOverdue(e) ? 'Vencida' : 'A pagar'}
                      </span>
                    </td>
                    {editable && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-end">
                          {e.status === 'pending' && (
                            <button
                              title="Marcar como paga"
                              onClick={() => markPaid.mutate(e.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            title="Editar"
                            onClick={() => {
                              setEditing(e);
                              setModalOpen(true);
                            }}
                            className="p-1 text-ink-muted hover:bg-surface-2 rounded"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            title="Excluir"
                            onClick={() => confirm(`Excluir a despesa "${e.description}"?`) && remove.mutate(e.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={editable ? 8 : 7} className="px-3 py-8 text-center text-ink-muted">
                    Nenhuma despesa no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ExpenseModal
          expense={editing}
          properties={properties ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: 'emerald' | 'amber' }) {
  const color = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-ink';
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`text-2xl font-serif num-tabular mt-1 ${color}`}>{brl(value)}</div>
    </div>
  );
}

function ExpenseModal({
  expense,
  properties,
  onClose,
  onSaved,
}: {
  expense: Expense | null;
  properties: Property[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    propertyId: expense?.propertyId ?? '',
    category: expense?.category ?? 'other',
    description: expense?.description ?? '',
    supplier: expense?.supplier ?? '',
    amount: expense ? String(expense.amount) : '',
    date: (expense?.date ?? new Date().toISOString()).slice(0, 10),
    status: expense?.status ?? 'pending',
    dueDate: expense?.dueDate?.slice(0, 10) ?? '',
    paidAt: expense?.paidAt?.slice(0, 10) ?? '',
    receiptUrl: expense?.receiptUrl ?? '',
  });

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        propertyId: form.propertyId || null,
        category: form.category,
        description: form.description.trim(),
        supplier: form.supplier.trim() || null,
        amount: Number(form.amount),
        date: form.date,
        status: form.status,
        dueDate: form.dueDate || null,
        paidAt: form.status === 'paid' ? form.paidAt || null : null,
        receiptUrl: form.receiptUrl.trim() || null,
      };
      return isEdit
        ? api(`/expenses/${expense!.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : api('/expenses', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Despesa atualizada' : 'Despesa criada');
      onSaved();
    },
    onError: (e: Error) => toast.error('Não foi possível salvar', e.message),
  });

  const valid = form.description.trim() && Number(form.amount) > 0;

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Editar despesa' : 'Nova despesa'}>
      <div className="space-y-3 px-6 py-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-ink-muted">Propriedade</span>
            <Select
              value={form.propertyId}
              onChange={(v) => setForm((f) => ({ ...f, propertyId: v }))}
              options={[
                { value: '', label: 'Geral do tenant' },
                ...properties.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">Categoria</span>
            <Select
              value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v }))}
              options={CATEGORIES}
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs text-ink-muted">Descrição</span>
          <input
            className="input-base w-full"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={200}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-ink-muted">Fornecedor (opcional)</span>
            <input
              className="input-base w-full"
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">Valor (R$)</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="input-base w-full num-tabular"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-ink-muted">Data</span>
            <input
              type="date"
              className="input-base w-full"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">Vencimento</span>
            <input
              type="date"
              className="input-base w-full"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink-muted">Status</span>
            <Select
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v as 'pending' | 'paid' }))}
              options={[
                { value: 'pending', label: 'A pagar' },
                { value: 'paid', label: 'Pago' },
              ]}
            />
          </label>
        </div>
        {form.status === 'paid' && (
          <label className="block">
            <span className="text-xs text-ink-muted">Data do pagamento</span>
            <input
              type="date"
              className="input-base w-full"
              value={form.paidAt}
              onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
            />
          </label>
        )}
        <label className="block">
          <span className="text-xs text-ink-muted">URL do comprovante (opcional)</span>
          <input
            className="input-base w-full"
            placeholder="https://..."
            value={form.receiptUrl}
            onChange={(e) => setForm((f) => ({ ...f, receiptUrl: e.target.value }))}
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={() => save.mutate()} disabled={!valid || save.isPending} className="btn-primary">
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
