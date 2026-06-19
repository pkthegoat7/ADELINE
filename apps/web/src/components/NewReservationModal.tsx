'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Phone, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
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

export interface PrefillReservation {
  roomId?: string;
  checkIn?: string;
  checkOut?: string;
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
  prefill,
  open,
  onClose,
}: {
  propertyId: string;
  editing?: EditingReservation;
  prefill?: PrefillReservation;
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

  const [roomId, setRoomId] = useState(editing?.roomId ?? prefill?.roomId ?? '');
  const [checkIn, setCheckIn] = useState(
    editing
      ? format(new Date(editing.checkIn), 'yyyy-MM-dd')
      : prefill?.checkIn ?? '',
  );
  const [checkOut, setCheckOut] = useState(
    editing
      ? format(new Date(editing.checkOut), 'yyyy-MM-dd')
      : prefill?.checkOut ?? '',
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

  useEffect(() => {
    if (!open || isEditing || !prefill) return;
    if (prefill.roomId) setRoomId(prefill.roomId);
    if (prefill.checkIn) setCheckIn(prefill.checkIn);
    if (prefill.checkOut) setCheckOut(prefill.checkOut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEditing, prefill?.roomId, prefill?.checkIn, prefill?.checkOut]);

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
      if (checkOut <= checkIn) throw new Error('A data de check-out precisa ser depois do check-in.');
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

  const roomOptions = (rooms.data ?? []).map((r) => ({
    value: r.id,
    label: `${r.code} — ${r.roomType.name}`,
  }));

  const selectedGuest = guests.data?.find((g) => g.id === selectedGuestId);

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
              <input
                type="text"
                placeholder="Nome completo"
                value={newGuestName}
                onChange={(e) => setNewGuestName(e.target.value)}
                className="input-base"
              />
              <input
                type="tel"
                placeholder="Telefone (opcional)"
                value={newGuestPhone}
                onChange={(e) => setNewGuestPhone(e.target.value)}
                className="input-base"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Buscar por nome, documento, email…"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                className="input-base"
              />
              <GuestList
                guests={guests.data}
                isLoading={guests.isLoading}
                selectedId={selectedGuestId}
                onSelect={setSelectedGuestId}
              />
              {selectedGuest && (
                <div className="text-xs text-ink-muted px-1">
                  Selecionado: <span className="font-medium text-ink">{selectedGuest.fullName}</span>
                </div>
              )}
            </div>
          )}
        </Field>

        {/* Quarto */}
        <Field label="Quarto">
          <Select
            value={roomId}
            onChange={setRoomId}
            options={roomOptions}
            placeholder={rooms.isLoading ? 'Carregando…' : 'Selecione o quarto'}
            className="w-full"
          />
        </Field>

        {/* Datas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Check-in">
            <input
              type="date"
              value={checkIn}
              onChange={(e) => {
                const v = e.target.value;
                setCheckIn(v);
                // Se o checkout ficou anterior ou igual ao novo checkin, reseta
                if (checkOut && v && checkOut <= v) setCheckOut('');
              }}
              className="input-base"
            />
          </Field>
          <Field label="Check-out">
            <input
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(e) => setCheckOut(e.target.value)}
              className="input-base"
            />
            {checkIn && checkOut && checkOut <= checkIn && (
              <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                Check-out deve ser depois do check-in.
              </p>
            )}
          </Field>
        </div>

        {/* Adultos / Crianças / Canal */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Adultos">
            <input
              type="number"
              min={1}
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="input-base"
            />
          </Field>
          <Field label="Crianças">
            <input
              type="number"
              min={0}
              value={children}
              onChange={(e) => setChildren(Number(e.target.value))}
              className="input-base"
            />
          </Field>
          <Field label="Canal">
            <Select
              value={channel}
              onChange={(v) => setChannel(v as typeof CHANNELS[number]['value'])}
              options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
              className="w-full"
            />
          </Field>
        </div>

        {/* Valor */}
        <Field label="Valor total (R$)">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            className="input-base"
          />
        </Field>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-line-soft -mx-5 px-5 mt-4">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={submit.isPending} className="btn-primary">
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

function GuestList({
  guests,
  isLoading,
  selectedId,
  onSelect,
}: {
  guests: Guest[] | undefined;
  isLoading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-line bg-surface-elevated p-4 text-sm text-ink-muted text-center">
        Carregando…
      </div>
    );
  }
  if (!guests || guests.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface-elevated p-4 text-sm text-ink-muted text-center">
        Nenhum hóspede encontrado. Tente outra busca ou crie um novo.
      </div>
    );
  }
  return (
    <ul className="rounded-lg border border-line bg-surface-elevated max-h-60 overflow-y-auto scrollbar-thin divide-y divide-line-soft">
      {guests.map((g) => {
        const selected = g.id === selectedId;
        return (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => onSelect(g.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                selected
                  ? 'bg-brand-50 dark:bg-brand-900/30'
                  : 'hover:bg-surface-sunken',
              )}
            >
              <span
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                  selected
                    ? 'bg-brand-200 text-brand-800 dark:bg-brand-700/50 dark:text-brand-200'
                    : 'bg-surface-sunken text-ink-muted',
                )}
              >
                <UserRound className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink truncate">{g.fullName}</div>
                {(g.phone || g.email) && (
                  <div className="text-xs text-ink-muted truncate flex items-center gap-1.5">
                    {g.phone && (
                      <>
                        <Phone className="w-3 h-3 flex-shrink-0" />
                        <span>{g.phone}</span>
                      </>
                    )}
                    {g.phone && g.email && <span className="text-ink-muted/50">·</span>}
                    {g.email && <span className="truncate">{g.email}</span>}
                  </div>
                )}
              </div>
              {selected && <Check className="w-4 h-4 text-brand-600 flex-shrink-0" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-ink-soft uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
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
      className={cn(
        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-surface-sunken text-ink-soft hover:bg-surface-sunken/70 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
