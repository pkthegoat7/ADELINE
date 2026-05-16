'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { format } from 'date-fns';
import { NewReservationModal, type EditingReservation } from '@/components/NewReservationModal';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

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

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-amber-100 text-amber-800 ring-amber-200' },
  confirmed: { label: 'Confirmada', color: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  checked_in: { label: 'Check-in', color: 'bg-sky-100 text-sky-800 ring-sky-200' },
  checked_out: { label: 'Finalizada', color: 'bg-stone-100 text-stone-700 ring-stone-200' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700 ring-red-200' },
  no_show: { label: 'No-show', color: 'bg-red-100 text-red-700 ring-red-200' },
};

export default function ReservationsPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; editing: EditingReservation }
  >({ mode: 'closed' });

  const { data, isLoading } = useQuery({
    queryKey: ['reservations'],
    queryFn: () => api<Reservation[]>('/reservations'),
  });

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
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="text-stone-500 text-sm">{data?.length ?? 0} resultados</p>
        </div>
        <button
          onClick={() => setModalState({ mode: 'create' })}
          disabled={!propertyId}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 active:scale-95 disabled:opacity-50 shadow-soft"
        >
          <Plus className="w-4 h-4" />
          Nova reserva
        </button>
      </header>

      {isLoading ? (
        <SkeletonTable rows={5} cols={9} />
      ) : (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left p-3 font-semibold">Código</th>
                <th className="text-left p-3 font-semibold">Hóspede</th>
                <th className="text-left p-3 font-semibold">Quarto</th>
                <th className="text-left p-3 font-semibold">Canal</th>
                <th className="text-left p-3 font-semibold">Check-in</th>
                <th className="text-left p-3 font-semibold">Check-out</th>
                <th className="text-right p-3 font-semibold">Total</th>
                <th className="text-left p-3 font-semibold">Status</th>
                <th className="text-right p-3 w-32 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((r) => {
                const isCancelled = r.status === 'cancelled';
                const status = STATUS_LABEL[r.status] ?? {
                  label: r.status,
                  color: 'bg-stone-100 text-stone-700',
                };
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      'border-b border-stone-100 last:border-0 hover:bg-stone-50/60 transition-colors',
                      isCancelled && 'opacity-50',
                    )}
                  >
                    <td className="p-3 font-mono text-xs text-stone-500">{r.code}</td>
                    <td className="p-3 font-medium">{r.guest.fullName}</td>
                    <td className="p-3">{r.rooms.map((rr) => rr.room.code).join(', ')}</td>
                    <td className="p-3 capitalize text-stone-600">{r.channel}</td>
                    <td className="p-3">{format(new Date(r.checkIn), 'dd/MM/yyyy')}</td>
                    <td className="p-3">{format(new Date(r.checkOut), 'dd/MM/yyyy')}</td>
                    <td className="p-3 text-right font-mono">
                      {Number(r.totalAmount).toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          'inline-block px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset',
                          status.color,
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => startEdit(r)}
                          disabled={isCancelled}
                          title="Editar"
                          className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmCancel(r)}
                          disabled={isCancelled || cancel.isPending}
                          title={isCancelled ? 'Já cancelada' : 'Cancelar reserva'}
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-md disabled:opacity-30 disabled:cursor-not-allowed active:scale-95"
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
              {data?.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-12 text-center text-stone-400">
                    <div className="inline-flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-stone-400" />
                      </div>
                      Nenhuma reserva. Crie a primeira no botão acima.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <NewReservationModal
        propertyId={propertyId}
        editing={modalState.mode === 'edit' ? modalState.editing : undefined}
        open={modalState.mode !== 'closed' && !!propertyId}
        onClose={() => setModalState({ mode: 'closed' })}
      />
    </div>
  );
}
