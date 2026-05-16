'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Info } from 'lucide-react';
import { api } from '@/lib/api';

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
  externalRoomId: string; // identificador externo qualquer (URL completa ou ID)
  externalRoomName: string;
  icalUrl: string;
}

export function ConnectChannelModal({
  propertyId,
  onClose,
}: {
  propertyId: string;
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
  });

  function toggleRoom(roomId: string) {
    setLinks((prev) => {
      const exists = prev.find((l) => l.roomId === roomId);
      if (exists) return prev.filter((l) => l.roomId !== roomId);
      return [...prev, { roomId, externalRoomId: '', externalRoomName: '', icalUrl: '' }];
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

      // No MVP, usamos a mesma icalImportUrl no nível da conexão (1ª) +
      // armazenamos as URLs individuais como externalRoomId pra cada mapping.
      return api('/channels', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          channel,
          icalImportUrl: links[0].icalUrl,
          roomMappings: links.map((l) => ({
            roomId: l.roomId,
            externalRoomId: l.icalUrl, // guardamos a URL aqui pra rastreio
            externalRoomName: l.externalRoomName.trim() || undefined,
          })),
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold">Conectar canal externo</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            create.mutate();
          }}
          className="p-4 space-y-4"
        >
          {/* Canal */}
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">Canal</label>
            <div className="mt-1 flex gap-2 flex-wrap">
              {CHANNELS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  className={`px-3 py-1.5 text-sm rounded ${
                    channel === c.value
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ajuda */}
          {showHelp && (
            <div className="bg-sky-50 border border-sky-200 rounded-md p-3 text-xs text-sky-900 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="font-semibold">Como pegar a URL iCal {channelLabel(channel)}:</div>
                  {channel === 'airbnb' && (
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>
                        Entra em <span className="font-mono">airbnb.com.br</span> como anfitrião
                      </li>
                      <li>
                        Vai em <strong>Calendário</strong> → escolhe o anúncio → <strong>Disponibilidade</strong>
                      </li>
                      <li>
                        Rola até <strong>Sincronizar calendários</strong> → <strong>Exportar calendário</strong>
                      </li>
                      <li>Copia a URL gerada (termina em <span className="font-mono">.ics</span>)</li>
                      <li>Cola no campo "URL iCal" do quarto correspondente abaixo</li>
                    </ol>
                  )}
                  {channel === 'booking' && (
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>
                        Entra no <span className="font-mono">extranet.booking.com</span>
                      </li>
                      <li>
                        <strong>Tarifas e disponibilidade</strong> → <strong>Sincronização do calendário</strong>
                      </li>
                      <li>Procura "Exportar calendário (iCal)" — copia a URL</li>
                    </ol>
                  )}
                  {channel !== 'airbnb' && channel !== 'booking' && (
                    <p>
                      Procure por "exportar iCal" ou "sync calendar" nas configurações do canal.
                      Cole a URL <span className="font-mono">.ics</span> abaixo.
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

          {/* Quartos pra mapear */}
          <div>
            <label className="text-xs font-medium text-stone-700 uppercase">
              Quartos a sincronizar
            </label>
            <p className="text-xs text-stone-500 mt-0.5 mb-2">
              Marque cada quarto que tem anúncio no {channelLabel(channel)} e cole a URL iCal
              dele.
            </p>

            <div className="space-y-2">
              {rooms.data?.map((r) => {
                const link = links.find((l) => l.roomId === r.id);
                const selected = !!link;
                return (
                  <div
                    key={r.id}
                    className={`border rounded p-3 text-sm ${selected ? 'border-stone-900 bg-stone-50' : 'border-stone-200'}`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleRoom(r.id)}
                      />
                      <span className="font-medium">{r.code}</span>
                      <span className="text-stone-500">— {r.roomType.name}</span>
                    </label>

                    {selected && (
                      <div className="mt-2 space-y-2 pl-6">
                        <div>
                          <label className="text-xs text-stone-600">URL iCal do anúncio</label>
                          <input
                            type="url"
                            required
                            placeholder="https://www.airbnb.com.br/calendar/ical/..."
                            value={link.icalUrl}
                            onChange={(e) => updateLink(r.id, { icalUrl: e.target.value })}
                            className="mt-0.5 w-full px-2 py-1.5 text-xs border border-stone-300 rounded font-mono"
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
                            onChange={(e) =>
                              updateLink(r.id, { externalRoomName: e.target.value })
                            }
                            className="mt-0.5 w-full px-2 py-1.5 text-xs border border-stone-300 rounded"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {rooms.data?.length === 0 && (
                <p className="text-sm text-stone-400 italic">
                  Cadastre quartos primeiro (página Quartos).
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending || links.length === 0}
              className="px-4 py-2 text-sm bg-stone-900 text-white rounded hover:bg-stone-800 disabled:opacity-50"
            >
              {create.isPending ? 'Conectando…' : `Conectar ${channelLabel(channel)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function channelLabel(v: ChannelValue): string {
  return CHANNELS.find((c) => c.value === v)?.label ?? v;
}
