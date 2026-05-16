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

      const payload = {
        propertyId,
        roomTypeId,
        code: code.trim(),
        floor: floor === '' ? null : Number(floor),
      };

      if (isEditing) {
        return api(`/rooms/${editing!.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            roomTypeId: payload.roomTypeId,
            code: payload.code,
            floor: payload.floor,
          }),
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
          <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Código</label>
          <input
            type="text"
            required
            placeholder="Ex: 101, Suite-A"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Andar</label>
          <input
            type="number"
            placeholder="(opcional)"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Tipo</label>
          <select
            value={roomTypeId}
            onChange={(e) => setRoomTypeId(e.target.value)}
            className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
          >
            <option value="">Selecione…</option>
            {types.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (capacidade {t.capacity} · R$ {Number(t.basePrice).toFixed(2)})
              </option>
            ))}
          </select>
          {types.data?.length === 0 && (
            <p className="text-xs text-amber-600 mt-1">
              Nenhum tipo cadastrado. Crie um tipo primeiro.
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-100 -mx-5 px-5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md active:scale-95"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submit.isPending}
            className="px-4 py-2 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {submit.isPending && <Spinner size={14} />}
            {submit.isPending ? 'Salvando…' : isEditing ? 'Salvar' : 'Criar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
