'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/lib/api';

interface Room {
  id: string;
  code: string;
  floor: number | null;
  roomType: { name: string; basePrice?: string };
}

interface Guest {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export interface EditingReservation {
  id: string;
  guestId: string;
  guestName: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  channel: string;
  adults: number;
  children: number;
  totalAmount: string;
}

const CHANNELS = [
  { value: 'direct', label: 'Direta' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking' },
  { value: 'expedia', label: 'Expedia' },
  { value: 'walk_in', label: 'Walk-in' },
] as const;

export function NewReservationModal({
  propertyId,
  editing,
  onClose,
}: {
  propertyId: string;
  editing?: EditingReservation;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isEditing = !!editing;

  const [guestMode, setGuestMode] = useState<'existing' | 'new'>(isEditing ? 'existing' : 'new');
  const [guestSearch, setGuestSearch] = useState(editing?.guestName ?? '');
  const [selectedGuestId, setSelectedGuestId] = useState<string>(editing?.guestId ?? '');
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestPhone, setNewGuestPhone] = useState('');

  const [roomId, setRoomId] = useState(editing?.roomId ?? '');
  const [checkIn, setCheckIn] = useState(
    editing ? format(new Date(editing.checkIn), 'yyyy-MM-dd') : '',
  );
  const [checkOut, setCheckOut] = useState(
    editing ? format(new Date(editing.checkOut), 'yyyy-MM-dd') : '',
  );
  const [channel, setChannel] = useState<typeof CHANNELS[number]['value']>(
    (editing?.channel as typeof CHANNELS[number]['value']) ?? 'direct',
  );
  const [adults, setAdults] = useState(editing?.adults ?? 2);
  const [children, setChildren] = useState(editing?.children ?? 0);
  const [totalAmount, setTotalAmount] = useState(
    editing ? Number(editing.totalAmount).toString() : '',
  );

  const [error, setError] = useState<string | null>(null);

  const rooms = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => api<Room[]>(`/rooms?propertyId=${propertyId}`),
  });

  const guests = useQuery({
    queryKey: ['guests', guestSearch],
    queryFn: () => api<Guest[]>(`/guests${guestSearch ? `?q=${encodeURIComponent(guestSearch)}` : ''}`),
    enabled: guestMode === 'existing',
  });

  const submit = useMutation({
    mutationFn: async () => {
      let guestId = selectedGuestId;

      if (guestMode === 'new') {
        if (!newGuestName.trim()) throw new Error('Nome do hóspede obrigatório');
        const newGuest = await api<{ id: string }>('/guests', {
          method: 'POST',
          body: JSON.stringify({
            fullName: newGuestName.trim(),
            phone: newGuestPhone.trim() || undefined,
          }),
        });
        guestId = newGuest.id;
      }

      if (!guestId) throw new Error('Selecione um hóspede');
      if (!roomId) throw new Error('Selecione um quarto');
      if (!checkIn || !checkOut) throw new Error('Datas obrigatórias');
      if (!totalAmount || Number(totalAmount) <= 0) throw new Error('Valor total inválido');

      const payload = {
        propertyId,
        guestId,
        roomId,
        checkIn,
        checkOut,
        channel,
        adults,
        children,
        totalAmount: Number(totalAmount),
      };

      return api(isEditing ? `/reservations/${editing!.id}` : '/reservations', {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold">{isEditing ? 'Editar reserva' : 'Nova reserva'}</h2>
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
            <label className="text-xs font-medium text-stone-700 uppercase">Hóspede</label>
            <div className="flex gap-2 mt-1 mb-2 text-sm">
              <button
                type="button"
                onClick={() => setGuestMode('new')}
                className={`px-3 py-1 rounded ${guestMode === 'new' ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}
              >
                Novo
              </button>
              <button
                type="button"
                onClick={() => setGuestMode('existing')}
                className={`px-3 py-1 rounded ${guestMode === 'existing' ? 'bg-stone-900 text-white' : 'bg-stone-100'}`}
              >
                Existente
              </button>
            </div>

            {guestMode === 'new' ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={newGuestName}
                  onChange={(e) => setNewGuestName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded"
                />
                <input
                  type="tel"
                  placeholder="Telefone (opcional)"
                  value={newGuestPhone}
                  onChange={(e) => setNewGuestPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Buscar por nome, documento, email…"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded"
                />
                <select
                  value={selectedGuestId}
                  onChange={(e) => setSelectedGuestId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-300 rounded"
                  size={Math.min(5, (guests.data?.length ?? 0) + 1)}
                >
                  <option value="">Selecione…</option>
                  {guests.data?.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.fullName} {g.phone ? `— ${g.phone}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Quarto</label>
            <select
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            >
              <option value="">Selecione…</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.roomType.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Check-in</label>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Check-out</label>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Adultos</label>
              <input
                type="number"
                min={1}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Crianças</label>
              <input
                type="number"
                min={0}
                value={children}
                onChange={(e) => setChildren(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700 uppercase">Canal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof CHANNELS[number]['value'])}
                className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
              >
                {CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Valor total (R$)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-stone-300 rounded"
            />
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
              {submit.isPending ? (isEditing ? 'Salvando…' : 'Criando…') : (isEditing ? 'Salvar alterações' : 'Criar reserva')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
