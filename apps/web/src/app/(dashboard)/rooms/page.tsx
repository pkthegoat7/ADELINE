'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { RoomFormModal, type EditingRoom } from '@/components/RoomFormModal';
import { RoomTypesModal } from '@/components/RoomTypesModal';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface Room {
  id: string;
  code: string;
  floor: number | null;
  status: 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order';
  active: boolean;
  roomType: { id: string; name: string; code: string; capacity: number; basePrice: string };
}

const STATUS_OPTIONS: Array<{
  value: Room['status'];
  label: string;
  color: string;
  selectColor: string;
}> = [
  {
    value: 'clean',
    label: 'Limpo',
    color: 'bg-emerald-100 text-emerald-700',
    selectColor:
      'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700/50 dark:text-emerald-200',
  },
  {
    value: 'dirty',
    label: 'Sujo',
    color: 'bg-amber-100 text-amber-700',
    selectColor:
      'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-700/50 dark:text-amber-200',
  },
  {
    value: 'inspected',
    label: 'Inspecionado',
    color: 'bg-sky-100 text-sky-700',
    selectColor:
      'bg-sky-50 border-sky-300 text-sky-800 dark:bg-sky-900/30 dark:border-sky-700/50 dark:text-sky-200',
  },
  {
    value: 'maintenance',
    label: 'Manutenção',
    color: 'bg-orange-100 text-orange-700',
    selectColor:
      'bg-orange-50 border-orange-300 text-orange-800 dark:bg-orange-900/30 dark:border-orange-700/50 dark:text-orange-200',
  },
  {
    value: 'out_of_order',
    label: 'Fora de serviço',
    color: 'bg-red-100 text-red-700',
    selectColor:
      'bg-red-50 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700/50 dark:text-red-200',
  },
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
      toast.success('Status atualizado');
    },
    onError: (err: Error) => toast.error('Erro ao atualizar', err.message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api(`/rooms/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Quarto desativado');
    },
    onError: (err: Error) => toast.error('Não foi possível desativar', err.message),
  });

  const deletePermanent = useMutation({
    mutationFn: (id: string) => api(`/rooms/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Quarto excluído', 'Removido definitivamente.');
    },
    onError: (err: Error) => toast.error('Não foi possível excluir', err.message),
  });

  function confirmDeletePermanent(r: Room) {
    if (
      confirm(
        `EXCLUIR DEFINITIVAMENTE o quarto ${r.code}?\n\n` +
          `Essa ação remove o quarto e o calendário de disponibilidade dele. ` +
          `Não pode ser desfeita.\n\n` +
          `Continuar?`,
      )
    ) {
      deletePermanent.mutate(r.id);
    }
  }

  function startEdit(r: Room) {
    setModalState({
      mode: 'edit',
      editing: { id: r.id, code: r.code, floor: r.floor, roomTypeId: r.roomType.id },
    });
  }

  function confirmDeactivate(r: Room) {
    if (!r.active) {
      toast.info('Quarto já está desativado');
      return;
    }
    if (
      confirm(
        `Desativar quarto ${r.code}?\n\nO histórico de reservas é preservado. Bloqueado se houver reservas ativas/futuras.`,
      )
    ) {
      deactivate.mutate(r.id);
    }
  }

  const visibleRooms = data?.filter((r) => showInactive || r.active) ?? [];
  const inactiveCount = data?.filter((r) => !r.active).length ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1600px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>Inventário</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink">Quartos</h2>
          <p className="text-sm text-ink-muted mt-1 num-tabular">
            {visibleRooms.length} {showInactive ? 'total' : 'ativos'}
            {!showInactive && inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(true)}
                className="ml-2 underline hover:text-brand-600 transition-colors"
              >
                ({inactiveCount} desativado{inactiveCount > 1 ? 's' : ''})
              </button>
            )}
            {showInactive && (
              <button
                onClick={() => setShowInactive(false)}
                className="ml-2 underline hover:text-brand-600 transition-colors"
              >
                ocultar desativados
              </button>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTypesModalOpen(true)} disabled={!propertyId} className="btn-secondary">
            <Tags className="w-4 h-4" />
            Tipos de quarto
          </button>
          <button onClick={() => setModalState({ mode: 'create' })} disabled={!propertyId} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo quarto
          </button>
        </div>
      </header>

      {isLoading && <SkeletonCards count={6} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {visibleRooms.map((r) => {
          const statusInfo = STATUS_OPTIONS.find((s) => s.value === r.status);
          return (
            <div
              key={r.id}
              className={cn(
                'surface-card p-5 space-y-3 card-hover',
                !r.active && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-serif text-2xl tracking-serif text-ink">{r.code}</div>
                  <div className="text-sm text-ink-soft">{r.roomType.name}</div>
                  {r.floor !== null && (
                    <div className="text-xs text-ink-muted">Andar {r.floor}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn('text-xs px-2 py-0.5 rounded', statusInfo?.color ?? 'bg-surface-sunken text-ink-soft')}>
                    {statusInfo?.label ?? r.status}
                  </span>
                  {!r.active && (
                    <span className="text-xs px-2 py-0.5 rounded bg-surface-sunken text-ink-muted">
                      desativado
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-ink-muted flex justify-between">
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
                className={cn(
                  'w-full px-3 py-2 rounded-md text-sm font-medium border outline-none transition-colors',
                  'focus:ring-2 focus:ring-brand-500/30',
                  statusInfo?.selectColor ?? 'bg-surface-elevated border-line text-ink',
                )}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    className="bg-surface-elevated text-ink"
                  >
                    {opt.label}
                  </option>
                ))}
              </select>

              <div className="flex gap-1 pt-1 border-t border-line-soft">
                <button
                  onClick={() => startEdit(r)}
                  className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 text-ink-soft hover:bg-surface-sunken rounded-md active:scale-95"
                >
                  <Pencil className="w-3 h-3" /> Editar
                </button>
                {r.active ? (
                  <button
                    onClick={() => confirmDeactivate(r)}
                    disabled={deactivate.isPending}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {deactivate.isPending && deactivate.variables === r.id ? (
                      <Spinner size={12} />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}{' '}
                    Desativar
                  </button>
                ) : (
                  <button
                    onClick={() => confirmDeletePermanent(r)}
                    disabled={deletePermanent.isPending}
                    className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {deletePermanent.isPending && deletePermanent.variables === r.id ? (
                      <Spinner size={12} />
                    ) : (
                      <Trash2 className="w-3 h-3" />
                    )}{' '}
                    Excluir
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!isLoading && visibleRooms.length === 0 && (
        <div className="surface-card p-8 text-center text-ink-muted">
          {data?.length === 0 ? 'Nenhum quarto cadastrado.' : 'Nenhum quarto ativo.'}
        </div>
      )}

      <RoomFormModal
        propertyId={propertyId}
        editing={modalState.mode === 'edit' ? modalState.editing : undefined}
        open={modalState.mode !== 'closed' && !!propertyId}
        onClose={() => setModalState({ mode: 'closed' })}
      />

      <RoomTypesModal
        propertyId={propertyId}
        open={typesModalOpen && !!propertyId}
        onClose={() => setTypesModalOpen(false)}
      />
    </div>
  );
}
