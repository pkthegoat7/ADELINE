'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { format } from 'date-fns';
import { NewReservationModal, type EditingReservation } from '@/components/NewReservationModal';

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

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  checked_in: 'bg-sky-100 text-sky-800',
  checked_out: 'bg-stone-100 text-stone-700',
  cancelled: 'bg-red-100 text-red-700',
  no_show: 'bg-red-100 text-red-700',
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
    },
    onError: (err: Error) => alert(`Erro ao cancelar: ${err.message}`),
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
      alert('Reserva já está cancelada.');
      return;
    }
    if (confirm(`Cancelar reserva ${r.code} de ${r.guest.fullName}?\nO quarto será liberado no calendário.`)) {
      cancel.mutate(r.id);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reservas</h1>
          <p className="text-stone-500 text-sm">{data?.length ?? 0} resultados</p>
        </div>
        <button
          onClick={() => setModalState({ mode: 'create' })}
          disabled={!propertyId}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Nova reserva
        </button>
      </header>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Código</th>
              <th className="text-left p-3">Hóspede</th>
              <th className="text-left p-3">Quarto</th>
              <th className="text-left p-3">Canal</th>
              <th className="text-left p-3">Check-in</th>
              <th className="text-left p-3">Check-out</th>
              <th className="text-right p-3">Total</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3 w-32">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="p-6 text-center text-stone-400">Carregando…</td></tr>
            )}
            {data?.map((r) => {
              const isCancelled = r.status === 'cancelled';
              return (
                <tr key={r.id} className={cn('border-b border-stone-100 hover:bg-stone-50', isCancelled && 'opacity-60')}>
                  <td className="p-3 font-mono text-xs">{r.code}</td>
                  <td className="p-3">{r.guest.fullName}</td>
                  <td className="p-3">{r.rooms.map((rr) => rr.room.code).join(', ')}</td>
                  <td className="p-3 capitalize">{r.channel}</td>
                  <td className="p-3">{format(new Date(r.checkIn), 'dd/MM/yyyy')}</td>
                  <td className="p-3">{format(new Date(r.checkOut), 'dd/MM/yyyy')}</td>
                  <td className="p-3 text-right font-mono">
                    {Number(r.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="p-3">
                    <span className={cn('inline-block px-2 py-0.5 rounded text-xs', STATUS_COLOR[r.status] ?? 'bg-stone-100')}>
                      {r.status}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(r)}
                        disabled={isCancelled}
                        title="Editar"
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => confirmCancel(r)}
                        disabled={isCancelled || cancel.isPending}
                        title={isCancelled ? 'Já cancelada' : 'Cancelar reserva'}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && data?.length === 0 && (
              <tr><td colSpan={9} className="p-6 text-center text-stone-400">Nenhuma reserva.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalState.mode !== 'closed' && propertyId && (
        <NewReservationModal
          propertyId={propertyId}
          editing={modalState.mode === 'edit' ? modalState.editing : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}
    </div>
  );
}
