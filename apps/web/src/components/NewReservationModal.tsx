'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

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
  open,
  onClose,
}: {
  propertyId: string;
  editing?: EditingReservation;
  open: boolean;
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
    enabled: open,
  });

  const guests = useQuery({
    queryKey: ['guests', guestSearch],
    queryFn: () => api<Guest[]>(`/guests${guestSearch ? `?q=${encodeURIComponent(guestSearch)}` : ''}`),
    enabled: open && guestMode === 'existing',
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
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['day-summary'] });
      toast.success(isEditing ? 'Reserva atualizada' : 'Reserva criada');
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Editar reserva' : 'Nova reserva'} size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          submit.mutate();
        }}
        className="p-5 space-y-4"
      >
        {/* Hóspede */}
        <Field label="Hóspede">
          <div className="flex gap-1.5 mb-2">
            <TabPill active={guestMode === 'new'} onClick={() => setGuestMode('new')}>
              Novo
            </TabPill>
            <TabPill active={guestMode === 'existing'} onClick={() => setGuestMode('existing')}>
              Existente
            </TabPill>
          </div>

          {guestMode === 'new' ? (
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Nome completo"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
              />
              <Input
                type="tel"
                placeholder="Telefone (opcional)"
                value={newGuestPhone}
                onChange={(e) => setNewGuestPhone(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Buscar por nome, documento, email…"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
              />
              <Select
                value={selectedGuestId}
                onChange={(e) => setSelectedGuestId(e.target.value)}
                size={Math.min(5, (guests.data?.length ?? 0) + 1)}
              >
                <option value="">Selecione…</option>
                {guests.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName} {g.phone ? `— ${g.phone}` : ''}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </Field>

        <Field label="Quarto">
          <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Selecione…</option>
            {rooms.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.roomType.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in">
            <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </Field>
          <Field label="Check-out">
            <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Adultos">
            <Input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
            />
          </Field>
          <Field label="Crianças">
            <Input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
            />
          </Field>
          <Field label="Canal">
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof CHANNELS[number]['value'])}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Valor total (R$)">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
          />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 -mx-5 px-5 mt-4 pt-4">
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
            {submit.isPending
              ? isEditing
                ? 'Salvando…'
                : 'Criando…'
              : isEditing
                ? 'Salvar alterações'
                : 'Criar reserva'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
    />
  );
}

function Select({
  children,
  size,
  value,
  onChange,
}: {
  children: React.ReactNode;
  size?: number;
  value: string;
  onChange: React.ChangeEventHandler<HTMLSelectElement>;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      size={size}
      className="w-full px-3 py-2 text-sm border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
    >
      {children}
    </select>
  );
}

function TabPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
        active
          ? 'bg-stone-900 text-white shadow-sm'
          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
      }`}
    >
      {children}
    </button>
  );
}
