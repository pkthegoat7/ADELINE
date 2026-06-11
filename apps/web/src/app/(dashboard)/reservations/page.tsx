'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Search, Filter, MessageCircle } from 'lucide-react';
import { SendRegistrationLinkModal } from '@/components/SendRegistrationLinkModal';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
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
  const qc = useQueryClient();
  const openReservation = useUI((s) => s.openReservation);
  const [modalState, setModalState] = useState<
    { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; editing: EditingReservation }
  >({ mode: 'closed' });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [fichaFor, setFichaFor] = useState<Reservation | null>(null);

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
    <div className="p-6 lg:p-8 space-y-5 max-w-[1600px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Histórico</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink">Todas as reservas</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {filtered.length} {filtered.length === 1 ? 'resultado' : 'resultados'}
            {data && filtered.length !== data.length && ` de ${data.length}`}
          </p>
        </div>
        <button
          onClick={() => setModalState({ mode: 'create' })}
          disabled={!propertyId}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          Nova reserva
        </button>
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
                          <button
                            onClick={() => setFichaFor(r)}
                            disabled={isCancelled}
                            data-tip="Enviar ficha (WhatsApp)"
                            className="p-1.5 text-ink-muted hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startEdit(r)}
                            disabled={isCancelled}
                            data-tip="Editar"
                            className="p-1.5 text-ink-muted hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => confirmCancel(r)}
                            disabled={isCancelled || cancel.isPending}
                            data-tip={isCancelled ? 'Já cancelada' : 'Cancelar'}
                            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                          >
                            {cancel.isPending && cancel.variables === r.id ? (
                              <Spinner size={16} />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
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
    </div>
  );
}
