'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Filter, MessageCircle, XCircle, CreditCard } from 'lucide-react';
import { SendRegistrationLinkModal } from '@/components/SendRegistrationLinkModal';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { useCan } from '@/lib/use-permissions';
import { cn } from '@/lib/cn';
import { format } from 'date-fns';
import { NewReservationModal, type EditingReservation } from '@/components/NewReservationModal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';
import { useUI } from '@/lib/ui-store';

interface Reservation {
  id: string;
  code: string;
  channel: string;
  status: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  totalAmount: string;
  guestId: string;
  guest: { id: string; fullName: string; phone: string | null };
  rooms: Array<{ room: { id: string; code: string } }>;
}

const STATUS_LABEL: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 ring-amber-200/60 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-700/40', dot: 'bg-amber-500' },
  confirmed: { label: 'Confirmada', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200/60 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-700/40', dot: 'bg-emerald-500' },
  checked_in: { label: 'Hospedado', color: 'bg-sky-100 text-sky-800 ring-sky-200/60 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-700/40', dot: 'bg-sky-500' },
  checked_out: { label: 'Finalizada', color: 'bg-sand-200 text-sand-800 ring-sand-300/60 dark:bg-sand-800/40 dark:text-sand-300 dark:ring-sand-700/40', dot: 'bg-sand-500' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 ring-red-200/60 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-700/40', dot: 'bg-red-500' },
  no_show: { label: 'No-show', color: 'bg-red-100 text-red-700 ring-red-200/60 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-700/40', dot: 'bg-red-500' },
};

const CHANNEL_LABEL: Record<string, string> = {
  direct: 'Direta',
  airbnb: 'Airbnb',
  booking: 'Booking',
  expedia: 'Expedia',
  walk_in: 'Walk-in',
  internal: 'Interno',
};

type StatusFilter = 'all' | 'active' | 'checked_in' | 'cancelled';

export default function ReservationsPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const can = useCan();
  const qc = useQueryClient();
  const openReservation = useUI((s) => s.openReservation);
  const [modalState, setModalState] = useState<
    { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; editing: EditingReservation }
  >({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [fichaFor, setFichaFor] = useState<Reservation | null>(null);
  const [payModal, setPayModal] = useState<{ id: string; total: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => api<Reservation[]>('/reservations'),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter((r) => {
      if (filter === 'active' && (r.status === 'cancelled' || r.status === 'checked_out')) return false;
      if (filter === 'checked_in' && r.status !== 'checked_in') return false;
      if (filter === 'cancelled' && r.status !== 'cancelled') return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.code.toLowerCase().includes(q) ||
        r.guest.fullName.toLowerCase().includes(q) ||
        r.rooms.some((rm) => rm.room.code.toLowerCase().includes(q))
      );
    });
  }, [data, query, filter]);

  const cancel = useMutation({
    mutationFn: (id: string) =>
      api(`/reservations/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Cancelado via painel' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Reserva cancelada', 'Quarto liberado no calendário.');
    },
    onError: (err: Error) => toast.error('Erro ao cancelar', err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/reservations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Reserva excluída', 'Removida do histórico e calendário liberado.');
    },
    onError: (err: Error) => toast.error('Erro ao excluir', err.message),
  });

  function confirmDelete(r: Reservation) {
    if (
      confirm(
        `EXCLUIR DEFINITIVAMENTE a reserva ${r.code} de ${r.guest.fullName}?\n\n` +
          `Ela some do histórico (pagamentos e fichas vinculadas também). ` +
          `Se quiser só liberar o quarto mantendo o registro, use Cancelar.\n\n` +
          `Essa ação não pode ser desfeita.`,
      )
    ) {
      remove.mutate(r.id);
    }
  }

  function startEdit(r: Reservation) {
    setModalState({
      mode: 'edit',
      editing: {
        id: r.id,
        guestId: r.guestId,
        guestName: r.guest.fullName,
        roomId: r.rooms[0]?.room.id ?? '',
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        channel: r.channel,
        adults: r.adults,
        children: r.children,
        totalAmount: r.totalAmount,
      },
    });
  }

  function confirmCancel(r: Reservation) {
    if (r.status === 'cancelled') {
      toast.info('Reserva já está cancelada');
      return;
    }
    if (
      confirm(
        `Cancelar reserva ${r.code} de ${r.guest.fullName}?\nO quarto será liberado no calendário.`,
      )
    ) {
      cancel.mutate(r.id);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-[1600px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Histórico</span>
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-serif text-ink">Todas as reservas</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            {data && filtered.length !== data.length && ` de ${data.length}`}
          </p>
        </div>
        {can('reservation:write') && (
          <button
            onClick={() => setModalState({ mode: 'create' })}
            disabled={!propertyId}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            Nova reserva
          </button>
        )}
      </header>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por código, hóspede ou quarto…"
            className="input-base pl-9"
          />
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface-elevated p-0.5 text-xs">
          {([
            { id: 'all', label: 'Todas' },
            { id: 'active', label: 'Ativas' },
            { id: 'checked_in', label: 'Hospedados' },
            { id: 'cancelled', label: 'Canceladas' },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-3 py-1.5 rounded-md transition-all',
                filter === f.id
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-soft hover:text-ink hover:bg-surface-sunken',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-ink-muted flex items-center gap-1.5">
          <Filter className="w-3 h-3" />
          <span className="hidden lg:inline">Filtros aplicados</span>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} cols={9} />
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="surface-card overflow-hidden shadow-soft"
        >
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken/60 border-b border-line text-ink-muted text-[10px] uppercase tracking-[0.18em]">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Código</th>
                  <th className="text-left px-4 py-3 font-semibold">Hóspede</th>
                  <th className="text-left px-4 py-3 font-semibold">Quarto</th>
                  <th className="text-left px-4 py-3 font-semibold">Canal</th>
                  <th className="text-left px-4 py-3 font-semibold">Check-in</th>
                  <th className="text-left px-4 py-3 font-semibold">Check-out</th>
                  <th className="text-right px-4 py-3 font-semibold">Total</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 w-32 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const isCancelled = r.status === 'cancelled';
                  const status = STATUS_LABEL[r.status] ?? {
                    label: r.status,
                    color: 'bg-sand-200 text-sand-700',
                    dot: 'bg-sand-500',
                  };
                  return (
                    <tr
                      key={r.id}
                      onClick={() => openReservation(r.id)}
                      style={{ animationDelay: `${Math.min(idx, 8) * 25}ms` }}
                      className={cn(
                        'border-b border-line-soft last:border-0 hover:bg-brand-50/40 dark:hover:bg-brand-900/10 transition-colors cursor-pointer animate-fade-in',
                        idx % 2 === 1 && 'bg-surface-sunken/20',
                        isCancelled && 'opacity-60',
                      )}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">{r.code}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{r.guest.fullName}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{r.rooms.map((rr) => rr.room.code).join(', ')}</td>
                      <td className="px-4 py-3 text-ink-soft">{CHANNEL_LABEL[r.channel] ?? r.channel}</td>
                      <td className="px-4 py-3 num-tabular text-ink-soft">{format(new Date(r.checkIn), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 num-tabular text-ink-soft">{format(new Date(r.checkOut), 'dd/MM/yyyy')}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink num-tabular">
                        {Number(r.totalAmount).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset',
                            status.color,
                          )}
                        >
                          <span className={cn('status-dot', status.dot)} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          {can('reservation:write') && (
                            <button
                              onClick={() => setFichaFor(r)}
                              disabled={isCancelled}
                              data-tip="Enviar ficha (WhatsApp)"
                              className="p-1.5 text-ink-muted hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}
                          {can('payment:link') && (
                            <button
                              onClick={() => setPayModal({ id: r.id, total: Number(r.totalAmount) })}
                              disabled={isCancelled}
                              data-tip="Link de pagamento"
                              className="p-1.5 text-ink-muted hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}
                          {can('reservation:write') && (
                            <button
                              onClick={() => startEdit(r)}
                              disabled={isCancelled}
                              data-tip="Editar"
                              className="p-1.5 text-ink-muted hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {can('reservation:cancel') && (
                            <button
                              onClick={() => confirmCancel(r)}
                              disabled={isCancelled || cancel.isPending}
                              data-tip={isCancelled ? 'Já cancelada' : 'Cancelar'}
                              className="p-1.5 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                              {cancel.isPending && cancel.variables === r.id ? (
                                <Spinner size={16} />
                              ) : (
                                <XCircle className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {can('reservation:delete') && (
                            <button
                              onClick={() => confirmDelete(r)}
                              disabled={remove.isPending}
                              data-tip="Excluir definitivamente"
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                              {remove.isPending && remove.variables === r.id ? (
                                <Spinner size={16} />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-16 text-center">
                      <div className="inline-flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-surface-sunken flex items-center justify-center">
                          <Plus className="w-6 h-6 text-ink-muted" />
                        </div>
                        <div className="text-ink-muted">
                          {query || filter !== 'all'
                            ? 'Nenhum resultado pros filtros aplicados.'
                            : 'Nenhuma reserva. Crie a primeira no botão acima.'}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      <NewReservationModal
        propertyId={propertyId}
        editing={modalState.mode === 'edit' ? modalState.editing : undefined}
        open={modalState.mode !== 'closed' && !!propertyId}
        onClose={() => setModalState({ mode: 'closed' })}
      />

      <SendRegistrationLinkModal
        open={!!fichaFor}
        onClose={() => setFichaFor(null)}
        reservationId={fichaFor?.id}
        reservationCode={fichaFor?.code}
        initialPhone={fichaFor?.guest.phone}
      />

      {payModal && (
        <PaymentLinkModal
          reservationId={payModal.id}
          reservationTotal={payModal.total}
          onClose={() => setPayModal(null)}
        />
      )}
    </div>
  );
}

function PaymentLinkModal({
  reservationId,
  reservationTotal,
  onClose,
}: {
  reservationId: string;
  reservationTotal: number;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(String(reservationTotal));
  const [description, setDescription] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(true);
  const [result, setResult] = useState<{ url: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const gen = useMutation({
    mutationFn: () =>
      api<{ url: string; message: string; sentViaWhatsapp: boolean }>(
        `/payments/reservations/${reservationId}/links`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Number(amount),
            description: description.trim() || undefined,
            sendWhatsapp,
          }),
        },
      ),
    onSuccess: (r) => {
      setResult({ url: r.url, message: r.message });
      toast.success(r.sentViaWhatsapp ? 'Link gerado e enviado por WhatsApp' : 'Link gerado');
    },
    onError: (err: Error) => toast.error('Erro ao gerar link', err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="surface-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-bold text-ink mb-4">Gerar link de pagamento</h3>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Valor (R$)</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-base w-full"
              />
              <p className="text-xs text-ink-muted mt-1">
                Total da reserva: R$ {reservationTotal.toFixed(2)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Descrição (opcional)</label>
              <input
                type="text"
                maxLength={120}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Sinal 30%"
                className="input-base w-full"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsapp}
                onChange={(e) => setSendWhatsapp(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              Enviar por WhatsApp automaticamente
            </label>
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm flex-1">
                Cancelar
              </button>
              <button
                onClick={() => gen.mutate()}
                disabled={!(Number(amount) > 0) || gen.isPending}
                className="btn-primary px-4 py-2 text-sm flex-1 disabled:opacity-50"
              >
                {gen.isPending ? 'Gerando…' : 'Gerar link'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Link</label>
              <input readOnly value={result.url} className="input-base w-full text-xs" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Mensagem pronta</label>
              <textarea
                readOnly
                value={result.message}
                rows={6}
                className="input-base w-full text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.message);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="btn-primary px-4 py-2 text-sm flex-1"
              >
                {copied ? 'Copiado!' : 'Copiar mensagem'}
              </button>
              <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm flex-1">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
