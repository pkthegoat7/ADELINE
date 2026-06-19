'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/lib/toast';

interface Room {
  id: string;
  code: string;
  roomType: { name: string };
}

const CHANNELS = [
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'booking', label: 'Booking' },
  { value: 'expedia', label: 'Expedia' },
  { value: 'vrbo', label: 'Vrbo' },
  { value: 'despegar', label: 'Despegar' },
] as const;

type ChannelValue = (typeof CHANNELS)[number]['value'];

interface RoomLink {
  roomId: string;
  externalRoomName: string;
  icalUrl: string;
}

export function ConnectChannelModal({
  propertyId,
  open,
  onClose,
}: {
  propertyId: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<ChannelValue>('airbnb');
  const [links, setLinks] = useState<RoomLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(true);

  const rooms = useQuery({
    queryKey: ['rooms', propertyId],
    queryFn: () => api<Room[]>(`/rooms?propertyId=${propertyId}`),
    enabled: open,
  });

  function toggleRoom(roomId: string) {
    setLinks((prev) => {
      const exists = prev.find((l) => l.roomId === roomId);
      if (exists) return prev.filter((l) => l.roomId !== roomId);
      return [...prev, { roomId, externalRoomName: '', icalUrl: '' }];
    });
  }

  function updateLink(roomId: string, patch: Partial<RoomLink>) {
    setLinks((prev) => prev.map((l) => (l.roomId === roomId ? { ...l, ...patch } : l)));
  }

  const create = useMutation({
    mutationFn: async () => {
      if (links.length === 0) throw new Error('Vincule pelo menos um quarto');
      for (const l of links) {
        if (!l.icalUrl.trim()) {
          throw new Error('Cada quarto precisa da URL iCal do anúncio externo');
        }
        try {
          new URL(l.icalUrl);
        } catch {
          throw new Error(`URL inválida: ${l.icalUrl}`);
        }
      }

      return api('/channels', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          channel,
          icalImportUrl: links[0].icalUrl,
          roomMappings: links.map((l) => ({
            roomId: l.roomId,
            externalRoomId: l.icalUrl,
            externalRoomName: l.externalRoomName.trim() || undefined,
          })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      toast.success('Canal conectado', 'Próximo pull em até 5 minutos.');
      setLinks([]);
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Modal open={open} onClose={onClose} title="Conectar canal externo" size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="p-5 space-y-4"
      >
        <div>
          <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">Canal</label>
          <div className="mt-1 flex gap-1.5 flex-wrap">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChannel(c.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition active:scale-95 ${
                  channel === c.value
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {showHelp && (
          <div className="bg-sky-50 border border-sky-200 rounded-md p-3 text-xs text-sky-900 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="font-semibold">
                  Como pegar a URL iCal {channelLabel(channel)}:
                </div>
                {channel === 'airbnb' && (
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      Entra em <span className="font-mono">airbnb.com.br/hosting</span>
                    </li>
                    <li>
                      <strong>Calendário</strong> → escolhe o anúncio →{' '}
                      <strong>Disponibilidade</strong>
                    </li>
                    <li>
                      <strong>Sincronizar calendários</strong> →{' '}
                      <strong>Exportar calendário</strong>
                    </li>
                    <li>
                      Copia a URL (termina em <span className="font-mono">.ics</span>)
                    </li>
                  </ol>
                )}
                {channel === 'booking' && (
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      Entra no <span className="font-mono">extranet.booking.com</span>
                    </li>
                    <li>
                      <strong>Tarifas e disponibilidade</strong> →{' '}
                      <strong>Sincronização do calendário</strong>
                    </li>
                    <li>"Exportar calendário (iCal)" — copia a URL</li>
                  </ol>
                )}
                {channel !== 'airbnb' && channel !== 'booking' && (
                  <p>
                    Procure por "exportar iCal" ou "sync calendar" nas configurações.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowHelp(false)}
                  className="underline hover:text-sky-700"
                >
                  Já sei, esconder
                </button>
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-stone-700 uppercase tracking-wider">
            Quartos a sincronizar
          </label>
          <p className="text-xs text-stone-500 mt-0.5 mb-2">
            Marque cada quarto com anúncio no {channelLabel(channel)} e cole a URL iCal dele.
          </p>

          <div className="space-y-2">
            {rooms.data?.map((r) => {
              const link = links.find((l) => l.roomId === r.id);
              const selected = !!link;
              return (
                <div
                  key={r.id}
                  className={`border rounded-md p-3 text-sm transition ${
                    selected ? 'border-stone-900 bg-stone-50' : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleRoom(r.id)}
                      className="rounded"
                    />
                    <span className="font-medium">{r.code}</span>
                    <span className="text-stone-500">— {r.roomType.name}</span>
                  </label>

                  {selected && (
                    <div className="mt-2 space-y-2 pl-6 animate-fade-in">
                      <div>
                        <label className="text-xs text-stone-600">URL iCal do anúncio</label>
                        <input
                          type="url"
                          required
                          placeholder="https://www.airbnb.com.br/calendar/ical/..."
                          value={link.icalUrl}
                          onChange={(e) => updateLink(r.id, { icalUrl: e.target.value })}
                          className="mt-0.5 w-full px-2 py-1.5 text-xs border border-stone-300 rounded-md font-mono focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-stone-600">
                          Nome no canal externo (opcional)
                        </label>
                        <input
                          type="text"
                          placeholder='Ex: "Suíte com vista mar"'
                          value={link.externalRoomName}
                          onChange={(e) => updateLink(r.id, { externalRoomName: e.target.value })}
                          className="mt-0.5 w-full px-2 py-1.5 text-xs border border-stone-300 rounded-md focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {rooms.data?.length === 0 && (
              <p className="text-sm text-stone-400 italic">Cadastre quartos primeiro.</p>
            )}
          </div>
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
            disabled={create.isPending || links.length === 0}
            className="px-4 py-2 text-sm bg-stone-900 text-white rounded-md hover:bg-stone-800 active:scale-95 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {create.isPending && <Spinner size={14} />}
            {create.isPending ? 'Conectando…' : `Conectar ${channelLabel(channel)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function channelLabel(v: ChannelValue): string {
  return CHANNELS.find((c) => c.value === v)?.label ?? v;
}
