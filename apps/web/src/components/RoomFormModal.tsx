'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

export interface EditingRoom {
  id: string;
  code: string;
  floor: number | null;
  roomTypeId: string;
}

interface RoomType {
  id: string;
  name: string;
  code: string;
  capacity: number;
  basePrice: string;
}

export function RoomFormModal({
  propertyId,
  editing,
  open,
  onClose,
}: {
  propertyId: string;
  editing?: EditingRoom;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEditing = !!editing;

  const [code, setCode] = useState(editing?.code ?? '');
  const [floor, setFloor] = useState<string>(
    editing?.floor !== undefined && editing?.floor !== null ? String(editing.floor) : '',
  );
  const [roomTypeId, setRoomTypeId] = useState(editing?.roomTypeId ?? '');
  const [error, setError] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['room-types', propertyId],
    queryFn: () => api<RoomType[]>(`/room-types?propertyId=${propertyId}`),
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: () => {
      if (!code.trim()) throw new Error('Código obrigatório');
      if (!roomTypeId) throw new Error('Selecione o tipo de quarto');

      // Campo opcional: omite quando vazio (backend recusa null com zod number())
      const floorValue = floor.trim() === '' ? undefined : Number(floor);

      const payload: Record<string, unknown> = {
        propertyId,
        roomTypeId,
        code: code.trim(),
      };
      if (floorValue !== undefined) payload.floor = floorValue;

      if (isEditing) {
        const body: Record<string, unknown> = {
          roomTypeId: payload.roomTypeId,
          code: payload.code,
        };
        if (floorValue !== undefined) body.floor = floorValue;
        return api(`/rooms/${editing!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      }
      return api('/rooms', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      toast.success(isEditing ? 'Quarto atualizado' : 'Quarto criado');
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar quarto' : 'Novo quarto'} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate();
        }}
        className="p-5 space-y-4"
      >
        <div>
          <label className="text-xs font-semibold text-ink-soft uppercase tracking-[0.12em]">Código</label>
          <input
            type="text"
            required
            placeholder="Ex: 101, Suite-A"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input-base mt-1.5"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-soft uppercase tracking-[0.12em]">Andar</label>
          <input
            type="number"
            placeholder="(opcional)"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="input-base mt-1.5"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-ink-soft uppercase tracking-[0.12em]">Tipo</label>
          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            className="input-base mt-1.5 cursor-pointer"
          >
            <option value="">Selecione…</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (capacidade {t.capacity} · R$ {Number(t.basePrice).toFixed(2)})
              </option>
            ))}
          </select>
          {types.data?.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Nenhum tipo cadastrado. Crie um tipo primeiro.
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-line -mx-5 px-5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submit.isPending}
            className="btn-primary"
          >
            {submit.isPending && <Spinner size={14} />}
            {submit.isPending ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
