'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { RoomFormModal, type EditingRoom } from '@/components/RoomFormModal';
import { RoomTypesModal } from '@/components/RoomTypesModal';

interface Room {
  id: string;
  code: string;
  floor: number | null;
  status: 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order';
  active: boolean;
  roomType: { id: string; name: string; code: string; capacity: number; basePrice: string };
}

const STATUS_OPTIONS: Array<{ value: Room['status']; label: string; color: string }> = [
  { value: 'clean', label: 'Limpo', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'dirty', label: 'Sujo', color: 'bg-amber-100 text-amber-700' },
  { value: 'inspected', label: 'Inspecionado', color: 'bg-sky-100 text-sky-700' },
  { value: 'maintenance', label: 'Manutenção', color: 'bg-orange-100 text-orange-700' },
  { value: 'out_of_order', label: 'Fora de serviço', color: 'bg-red-100 text-red-700' },
];

export default function RoomsPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const qc = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; editing: EditingRoom }
  >({ mode: 'closed' });
  const [typesModalOpen, setTypesModalOpen] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => api<Room[]>(`/rooms${propertyId ? `?propertyId=${propertyId}` : ''}`),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Room['status'] }) =>
      api(`/rooms/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: Error) => alert(`Erro ao atualizar: ${err.message}`),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/rooms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
    onError: (err: Error) => alert(`${err.message}`),
  });

  function startEdit(r: Room) {
    setModalState({
      mode: 'edit',
      editing: { id: r.id, code: r.code, floor: r.floor, roomTypeId: r.roomType.id },
    });
  }

  function confirmDeactivate(r: Room) {
    if (!r.active) {
      alert('Quarto já está desativado.');
      return;
    }
    if (
      confirm(
        `Desativar quarto ${r.code}?\n\n` +
          `O histórico de reservas é preservado. Esta operação pode ser revertida no banco.\n\n` +
          `Se houver reservas ativas/futuras, a operação será bloqueada.`,
      )
    ) {
      deactivate.mutate(r.id);
    }
  }

  const visibleRooms = data?.filter((r) => showInactive || r.active) ?? [];
  const inactiveCount = data?.filter((r) => !r.active).length ?? 0;

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quartos</h1>
          <p className="text-stone-500 text-sm">
            {visibleRooms.length} {showInactive ? 'total' : 'ativos'}
            {!showInactive && inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(true)}
                className="ml-2 underline hover:text-stone-700"
              >
                ({inactiveCount} desativado{inactiveCount > 1 ? 's' : ''})
              </button>
            )}
            {showInactive && (
              <button
                onClick={() => setShowInactive(false)}
                className="ml-2 underline hover:text-stone-700"
              >
                ocultar desativados
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTypesModalOpen(true)}
            disabled={!propertyId}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-stone-300 rounded-md hover:bg-stone-100 disabled:opacity-50"
          >
            <Tags className="w-4 h-4" />
            Tipos de quarto
          </button>
          <button
            onClick={() => setModalState({ mode: 'create' })}
            disabled={!propertyId}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm rounded-md hover:bg-stone-800 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Novo quarto
          </button>
        </div>
      </header>

      {isLoading && <div className="text-stone-500">Carregando…</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleRooms.map((r) => {
          const statusInfo = STATUS_OPTIONS.find((s) => s.value === r.status);
          return (
            <div
              key={r.id}
              className={cn(
                'bg-white border border-stone-200 rounded-lg p-4 space-y-3',
                !r.active && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold">{r.code}</div>
                  <div className="text-sm text-stone-500">{r.roomType.name}</div>
                  {r.floor !== null && (
                    <div className="text-xs text-stone-400">Andar {r.floor}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn('text-xs px-2 py-0.5 rounded', statusInfo?.color ?? 'bg-stone-100')}>
                    {statusInfo?.label ?? r.status}
                  </span>
                  {!r.active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-300 text-stone-700">
                      desativado
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-stone-500 flex justify-between">
                <span>Capacidade: {r.roomType.capacity}</span>
                <span className="font-mono">
                  {Number(r.roomType.basePrice).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>

              <select
                value={r.status}
                onChange={(e) =>
                  updateStatus.mutate({ id: r.id, status: e.target.value as Room['status'] })
                }
                disabled={updateStatus.isPending || !r.active}
                className="w-full text-sm px-2 py-1.5 border border-stone-300 rounded"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex gap-1 pt-1 border-t border-stone-100">
                <button
                  onClick={() => startEdit(r)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 text-stone-600 hover:bg-stone-100 rounded"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                <button
                  onClick={() => confirmDeactivate(r)}
                  disabled={!r.active || deactivate.isPending}
                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 text-red-600 hover:bg-red-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3 h-3" /> Desativar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && visibleRooms.length === 0 && (
        <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-400">
          {data?.length === 0 ? 'Nenhum quarto cadastrado.' : 'Nenhum quarto ativo.'}
        </div>
      )}

      {modalState.mode !== 'closed' && propertyId && (
        <RoomFormModal
          propertyId={propertyId}
          editing={modalState.mode === 'edit' ? modalState.editing : undefined}
          onClose={() => setModalState({ mode: 'closed' })}
        />
      )}

      {typesModalOpen && propertyId && (
        <RoomTypesModal propertyId={propertyId} onClose={() => setTypesModalOpen(false)} />
      )}
    </div>
  );
}
