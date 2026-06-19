'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { toast } from '@/lib/toast';

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface PayoutLine {
  kind: 'reservation' | 'commission' | 'monthly_fee' | 'expense' | 'adjustment';
  date: string | null;
  description: string;
  credit: number;
  debit: number;
  entryId?: string;
}

interface PayoutView {
  propertyId: string;
  propertyName: string;
  ownerId: string | null;
  ownerName: string | null;
  competence: string;
  status: 'open' | 'paid';
  paidAt: string | null;
  paymentMethod: string | null;
  receiptUrl: string | null;
  revenueAmount: number;
  commissionPercent: number;
  commissionFeeAmount: number;
  monthlyFeeAmount: number;
  expensesAmount: number;
  adjustmentsCredit: number;
  adjustmentsDebit: number;
  netPayoutAmount: number;
  reservationCount: number;
  breakdown: { lines: PayoutLine[] };
}

/* ─── Formatters ─────────────────────────────────────────────────────────────── */

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

const currentCompetence = () => new Date().toISOString().slice(0, 7);

/* ─── Page ───────────────────────────────────────────────────────────────────── */

export default function RepassesPage() {
  const qc = useQueryClient();
  const can = useCan();

  const [competence, setCompetence] = useState(currentCompetence);
  const [detailTarget, setDetailTarget] = useState<{ propertyId: string; competence: string } | null>(null);

  const { data: list, isLoading } = useQuery({
    queryKey: ['payouts', competence],
    queryFn: () => api<PayoutView[]>('/payouts?competence=' + competence),
  });

  if (!can('payout:read')) {
    return (
      <div className="p-8 text-ink-muted">Você não tem acesso a esta área.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1400px]">
      {/* Header */}
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Financeiro</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Repasses</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {list?.length ?? 0} imóvel{list?.length !== 1 ? 'eis' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-muted sr-only" htmlFor="competence-input">
            Competência
          </label>
          <input
            id="competence-input"
            type="month"
            className="input-base"
            value={competence}
            onChange={(e) => setCompetence(e.target.value)}
          />
        </div>
      </header>

      {/* Tabela */}
      {isLoading ? (
        <SkeletonTable />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="text-left text-ink-muted border-b border-line">
              <tr>
                <th className="px-3 py-2 font-medium">Imóvel</th>
                <th className="px-3 py-2 font-medium">Proprietário</th>
                <th className="px-3 py-2 font-medium text-right">Receita</th>
                <th className="px-3 py-2 font-medium text-right">Taxa adm</th>
                <th className="px-3 py-2 font-medium text-right">Despesas</th>
                <th className="px-3 py-2 font-medium text-right">Repasse</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list?.length ? (
                list.map((p) => {
                  const adminFee = p.commissionFeeAmount + p.monthlyFeeAmount;
                  const isPaid = p.status === 'paid';
                  const isNegative = p.netPayoutAmount < 0;
                  return (
                    <tr key={p.propertyId} className="border-b border-line/60 hover:bg-surface-2/40">
                      <td className="px-3 py-2 font-medium">{p.propertyName}</td>
                      <td className="px-3 py-2">
                        {p.ownerName ?? <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right num-tabular">{brl(p.revenueAmount)}</td>
                      <td className="px-3 py-2 text-right num-tabular">
                        <span>{brl(adminFee)}</span>
                        <span className="block text-xs text-ink-muted">
                          {p.commissionPercent}% + fixo
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num-tabular">{brl(p.expensesAmount)}</td>
                      <td
                        className={`px-3 py-2 text-right num-tabular font-semibold ${
                          isNegative ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {brl(p.netPayoutAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {isPaid ? `Pago em ${fmtDate(p.paidAt)}` : 'Em aberto'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() =>
                            setDetailTarget({ propertyId: p.propertyId, competence: p.competence })
                          }
                          className="btn-secondary text-xs"
                        >
                          Ver extrato
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-ink-muted">
                    Nenhum imóvel com proprietário definido. Cadastre proprietários e vincule
                    imóveis em Proprietários.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detalhe / Extrato */}
      {detailTarget && (
        <PayoutDetailModal
          propertyId={detailTarget.propertyId}
          competence={detailTarget.competence}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

/* ─── PayoutDetailModal ──────────────────────────────────────────────────────── */

function PayoutDetailModal({
  propertyId,
  competence,
  onClose,
}: {
  propertyId: string;
  competence: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const can = useCan();
  const canManage = can('payout:manage');

  const { data: payout, isLoading } = useQuery({
    queryKey: ['payout', propertyId, competence],
    queryFn: () => api<PayoutView>(`/payouts/${propertyId}/${competence}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['payout', propertyId, competence] });
    qc.invalidateQueries({ queryKey: ['payouts', competence] });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={
        payout
          ? `Extrato — ${payout.propertyName} · ${competence}`
          : 'Carregando extrato…'
      }
    >
      <div className="px-6 py-5 space-y-5">
        {isLoading || !payout ? (
          <SkeletonTable />
        ) : (
          <>
            {/* Razão */}
            <LedgerTable payout={payout} canManage={canManage} onInvalidate={invalidate} competence={competence} />

            {/* Status + ações */}
            <PayoutStatusSection
              payout={payout}
              canManage={canManage}
              onInvalidate={invalidate}
              onClose={onClose}
            />

            {/* Adicionar lançamento */}
            {payout.status === 'open' && canManage && (
              <AddEntryForm
                propertyId={propertyId}
                competence={competence}
                onInvalidate={invalidate}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─── LedgerTable ────────────────────────────────────────────────────────────── */

function LedgerTable({
  payout,
  canManage,
  onInvalidate,
  competence,
}: {
  payout: PayoutView;
  canManage: boolean;
  onInvalidate: () => void;
  competence: string;
}) {
  const qc = useQueryClient();

  const removeEntry = useMutation({
    mutationFn: (entryId: string) => api(`/payouts/entries/${entryId}`, { method: 'DELETE' }),
    onSuccess: () => {
      onInvalidate();
      toast.success('Lançamento removido');
    },
    onError: (e: Error) => toast.error('Não foi possível remover', e.message),
  });

  const lines = payout.breakdown?.lines ?? [];
  let runningBalance = 0;

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-sm">
        <thead className="text-left text-ink-muted border-b border-line">
          <tr>
            <th className="px-3 py-2 font-medium">Descrição</th>
            <th className="px-3 py-2 font-medium text-right">Crédito</th>
            <th className="px-3 py-2 font-medium text-right">Débito</th>
            <th className="px-3 py-2 font-medium text-right">Saldo</th>
            {canManage && payout.status === 'open' && <th className="px-3 py-2 w-8" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            runningBalance += line.credit - line.debit;
            return (
              <tr key={idx} className="border-b border-line/60 hover:bg-surface-2/40">
                <td className="px-3 py-2">
                  <span>{line.description}</span>
                  {line.date && (
                    <span className="text-ink-muted text-xs ml-1">{fmtDate(line.date)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right num-tabular text-emerald-700">
                  {line.credit > 0 ? brl(line.credit) : '—'}
                </td>
                <td className="px-3 py-2 text-right num-tabular text-red-600">
                  {line.debit > 0 ? brl(line.debit) : '—'}
                </td>
                <td className="px-3 py-2 text-right num-tabular font-medium">
                  {brl(runningBalance)}
                </td>
                {canManage && payout.status === 'open' && (
                  <td className="px-3 py-2">
                    {line.entryId ? (
                      <button
                        title="Remover lançamento"
                        onClick={() =>
                          confirm(`Remover "${line.description}"?`) &&
                          removeEntry.mutate(line.entryId!)
                        }
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        disabled={removeEntry.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {/* Linha final: repasse líquido */}
          <tr className="bg-surface-2 font-semibold border-t border-line">
            <td className="px-3 py-2">Repasse líquido</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td
              className={`px-3 py-2 text-right num-tabular ${
                payout.netPayoutAmount < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {brl(payout.netPayoutAmount)}
            </td>
            {canManage && payout.status === 'open' && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ─── PayoutStatusSection ────────────────────────────────────────────────────── */

function PayoutStatusSection({
  payout,
  canManage,
  onInvalidate,
  onClose,
}: {
  payout: PayoutView;
  canManage: boolean;
  onInvalidate: () => void;
  onClose: () => void;
}) {
  const [payForm, setPayForm] = useState<{
    open: boolean;
    paidAt: string;
    paymentMethod: string;
    receiptUrl: string;
  }>({
    open: false,
    paidAt: new Date().toISOString().slice(0, 10),
    paymentMethod: '',
    receiptUrl: '',
  });

  const pay = useMutation({
    mutationFn: () =>
      api(`/payouts/${payout.propertyId}/${payout.competence}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paidAt: payForm.paidAt || undefined,
          paymentMethod: payForm.paymentMethod.trim() || undefined,
          receiptUrl: payForm.receiptUrl.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      onInvalidate();
      toast.success('Repasse pago');
      onClose();
    },
    onError: (e: Error) => toast.error('Não foi possível marcar como pago', e.message),
  });

  const reopen = useMutation({
    mutationFn: () =>
      api(`/payouts/${payout.propertyId}/${payout.competence}/reopen`, { method: 'POST' }),
    onSuccess: () => {
      onInvalidate();
      toast.success('Repasse reaberto');
    },
    onError: (e: Error) => toast.error('Não foi possível reabrir', e.message),
  });

  if (payout.status === 'paid') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
        <span className="text-sm text-emerald-800">
          Pago em {fmtDate(payout.paidAt)}
          {payout.paymentMethod ? ` · ${payout.paymentMethod}` : ''}
          {payout.receiptUrl && (
            <>
              {' · '}
              <a
                href={payout.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                comprovante
              </a>
            </>
          )}
        </span>
        {canManage && (
          <button
            onClick={() => reopen.mutate()}
            disabled={reopen.isPending}
            className="btn-secondary text-xs"
          >
            {reopen.isPending ? 'Reabrindo…' : 'Reabrir'}
          </button>
        )}
      </div>
    );
  }

  // status === 'open'
  if (!canManage) return null;

  return (
    <div className="space-y-3">
      {!payForm.open ? (
        <div className="flex justify-end">
          <button
            onClick={() => setPayForm((f) => ({ ...f, open: true }))}
            className="btn-primary"
          >
            Marcar pago
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-line p-4 space-y-3">
          <p className="text-sm font-medium text-ink">Registrar pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">Data do pagamento</span>
              <input
                type="date"
                className="input-base w-full"
                value={payForm.paidAt}
                onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">Forma de pagamento</span>
              <input
                className="input-base w-full"
                placeholder="Ex: Pix"
                value={payForm.paymentMethod}
                onChange={(e) => setPayForm((f) => ({ ...f, paymentMethod: e.target.value }))}
                maxLength={80}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-ink-muted">URL do comprovante (opcional)</span>
            <input
              className="input-base w-full"
              placeholder="https://..."
              value={payForm.receiptUrl}
              onChange={(e) => setPayForm((f) => ({ ...f, receiptUrl: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setPayForm((f) => ({ ...f, open: false }))}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              onClick={() => pay.mutate()}
              disabled={pay.isPending}
              className="btn-primary"
            >
              {pay.isPending ? 'Salvando…' : 'Confirmar pagamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AddEntryForm ───────────────────────────────────────────────────────────── */

const ENTRY_TYPE_OPTIONS = [
  { value: 'credit', label: 'Crédito' },
  { value: 'debit', label: 'Débito' },
];

function AddEntryForm({
  propertyId,
  competence,
  onInvalidate,
}: {
  propertyId: string;
  competence: string;
  onInvalidate: () => void;
}) {
  const [form, setForm] = useState({ type: 'credit', description: '', amount: '' });

  const add = useMutation({
    mutationFn: () =>
      api(`/payouts/${propertyId}/${competence}/entries`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type as 'credit' | 'debit',
          description: form.description.trim(),
          amount: Number(form.amount),
        }),
      }),
    onSuccess: () => {
      onInvalidate();
      toast.success('Lançamento adicionado');
      setForm({ type: 'credit', description: '', amount: '' });
    },
    onError: (e: Error) => toast.error('Não foi possível adicionar', e.message),
  });

  const valid = form.description.trim() && Number(form.amount) > 0;

  return (
    <div className="rounded-lg border border-line p-4 space-y-3">
      <p className="text-sm font-medium text-ink">Adicionar lançamento</p>
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs text-ink-muted">Tipo</span>
          <Select
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
            options={ENTRY_TYPE_OPTIONS}
          />
        </label>
        <label className="block col-span-2">
          <span className="text-xs text-ink-muted">Descrição</span>
          <input
            className="input-base w-full"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            maxLength={200}
            placeholder="Ex: Ajuste de comissão"
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3 items-end">
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
        <div className="col-span-2 flex justify-end">
          <button
            onClick={() => add.mutate()}
            disabled={!valid || add.isPending}
            className="btn-primary"
          >
            {add.isPending ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}
