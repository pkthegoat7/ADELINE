'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

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
  onClose,
}: {
  propertyId: string;
  editing?: EditingRoom;
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
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold">{isEditing ? 'Editar quarto' : 'Novo quarto'}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            submit.mutate();
          }}
          className="p-4 space-y-4"
        >
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Código</label>
            <input
              type="text"
              required
              placeholder="Ex: 101, Suite-A"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Andar</label>
            <input
              type="number"
              placeholder="(opcional)"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Tipo</label>
            <select
              value={roomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
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
                Nenhum tipo cadastrado. Crie um tipo primeiro (UI ainda não disponível — use API/DB).
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submit.isPending}
              className="px-4 py-2 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-50"
            >
              {submit.isPending ? 'Salvando…' : (isEditing ? 'Salvar' : 'Criar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
