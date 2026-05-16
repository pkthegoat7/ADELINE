'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, isSameDay, isWeekend } from 'date-fns';
import { useMemo } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface CalendarRoom {
  id: string;
  code: string;
  floor: number | null;
  status: string;
  roomType: { id: string; name: string; code: string };
}

interface CalendarCell {
  id: string;
  roomId: string;
  date: string;
  status: 'available' | 'blocked' | 'reserved' | 'maintenance';
  source: string;
  reservationId: string | null;
  reservation: {
    id: string;
    code: string;
    channel: string;
    checkIn: string;
    checkOut: string;
    guest: { fullName: string };
  } | null;
}

interface CalendarPayload {
  rooms: CalendarRoom[];
  cells: CalendarCell[];
}

const CHANNEL_COLOR: Record<string, string> = {
  direct: 'bg-emerald-500',
  internal: 'bg-stone-500',
  airbnb: 'bg-rose-500',
  booking: 'bg-blue-500',
  expedia: 'bg-amber-500',
  walk_in: 'bg-purple-500',
};

export function Timeline({
  from,
  to,
  days,
  startDate,
}: {
  from: string;
  to: string;
  days: number;
  startDate: Date;
}) {
  // TODO: pegar propertyId do contexto/seleção. Por ora, hardcoded.
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendar', propertyId, from, to],
    queryFn: () =>
      api<CalendarPayload>(`/availability/calendar?propertyId=${propertyId}&from=${from}&to=${to}`),
    enabled: !!propertyId,
  });

  const dateColumns = useMemo(
    () => Array.from({ length: days }).map((_, i) => addDays(startDate, i)),
    [days, startDate],
  );

  const cellsByRoom = useMemo(() => {
    const map = new Map<string, Map<string, CalendarCell>>();
    if (!data) return map;
    for (const c of data.cells) {
      if (!map.has(c.roomId)) map.set(c.roomId, new Map());
      map.get(c.roomId)!.set(format(new Date(c.date), 'yyyy-MM-dd'), c);
    }
    return map;
  }, [data]);

  if (!propertyId) {
    return (
      <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded-md p-4 text-sm">
        Defina <code>NEXT_PUBLIC_DEMO_PROPERTY_ID</code> no <code>.env.local</code> para visualizar
        o calendário.
      </div>
    );
  }
  if (isLoading) return <div className="text-stone-500">Carregando…</div>;
  if (error) return <div className="text-red-600">Erro ao carregar calendário.</div>;
  if (!data) return null;

  const colWidth = 90;

  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto scrollbar-thin">
      <div style={{ minWidth: 220 + days * colWidth }}>
        {/* Header */}
        <div className="grid sticky top-0 z-10 bg-white border-b border-stone-200" style={{ gridTemplateColumns: `220px repeat(${days}, ${colWidth}px)` }}>
          <div className="p-3 text-xs font-semibold text-stone-500 uppercase border-r border-stone-200">
            Quarto
          </div>
          {dateColumns.map((d) => (
            <div
              key={d.toISOString()}
              className={cn(
                'p-2 text-center text-xs border-r border-stone-200',
                isWeekend(d) && 'bg-stone-50',
                isSameDay(d, new Date()) && 'bg-brand-50',
              )}
            >
              <div className="font-semibold text-stone-700">{format(d, 'dd')}</div>
              <div className="text-stone-400 uppercase">{format(d, 'EEE')}</div>
            </div>
          ))}
        </div>

        {/* Linhas */}
        {data.rooms.map((room) => (
          <div
            key={room.id}
            className="grid border-b border-stone-100 hover:bg-stone-50/50"
            style={{ gridTemplateColumns: `220px repeat(${days}, ${colWidth}px)` }}
          >
            <div className="p-3 border-r border-stone-200">
              <div className="font-semibold text-sm">{room.code}</div>
              <div className="text-xs text-stone-500">{room.roomType.name}</div>
              <div className="mt-1">
                <RoomStatusBadge status={room.status} />
              </div>
            </div>
            {dateColumns.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const cell = cellsByRoom.get(room.id)?.get(key);
              return (
                <CellView
                  key={key}
                  date={d}
                  cell={cell}
                  isWeekendDay={isWeekend(d)}
                  isToday={isSameDay(d, new Date())}
                />
              );
            })}
          </div>
        ))}
        {data.rooms.length === 0 && (
          <div className="p-8 text-center text-stone-400">Nenhum quarto cadastrado.</div>
        )}
      </div>
      <Legend />
    </div>
  );
}

function CellView({
  date,
  cell,
  isWeekendDay,
  isToday,
}: {
  date: Date;
  cell: CalendarCell | undefined;
  isWeekendDay: boolean;
  isToday: boolean;
}) {
  const status = cell?.status ?? 'available';
  const channel = cell?.source ?? 'internal';
  const r = cell?.reservation;

  if (status === 'reserved' && r) {
    const color = CHANNEL_COLOR[r.channel] ?? 'bg-stone-500';
    return (
      <div
        className={cn(
          'm-1 rounded px-2 py-1 text-white text-xs leading-tight cursor-pointer hover:opacity-90 transition',
          color,
        )}
        title={`${r.code} • ${r.guest.fullName} • ${r.channel}`}
      >
        <div className="font-semibold truncate">{r.guest.fullName}</div>
        <div className="opacity-80 truncate">{r.code}</div>
      </div>
    );
  }

  if (status === 'blocked' || status === 'maintenance') {
    return (
      <div
        className={cn(
          'm-1 rounded text-xs px-2 py-1 text-stone-700 bg-stone-200 cursor-pointer',
          status === 'maintenance' && 'bg-amber-200',
        )}
        title={status === 'maintenance' ? 'Manutenção' : 'Bloqueado'}
      >
        {status === 'maintenance' ? '🔧 Manut.' : '⛔ Bloq.'}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'border-r border-stone-100 cursor-pointer hover:bg-brand-50/40',
        isWeekendDay && 'bg-stone-50/60',
        isToday && 'bg-brand-50/40',
      )}
      title={`Disponível • ${format(date, 'dd/MM')}`}
    />
  );
}

function RoomStatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    clean: 'bg-emerald-100 text-emerald-700',
    dirty: 'bg-amber-100 text-amber-700',
    inspected: 'bg-sky-100 text-sky-700',
    maintenance: 'bg-orange-100 text-orange-700',
    out_of_order: 'bg-red-100 text-red-700',
  };
  const labels: Record<string, string> = {
    clean: 'Limpo',
    dirty: 'Sujo',
    inspected: 'Inspecionado',
    maintenance: 'Manutenção',
    out_of_order: 'Fora',
  };
  return (
    <span className={cn('inline-block text-[10px] px-1.5 py-0.5 rounded', palette[status] ?? 'bg-stone-100')}>
      {labels[status] ?? status}
    </span>
  );
}

function Legend() {
  const items: Array<{ color: string; label: string }> = [
    { color: 'bg-emerald-500', label: 'Direta' },
    { color: 'bg-rose-500', label: 'Airbnb' },
    { color: 'bg-blue-500', label: 'Booking' },
    { color: 'bg-amber-500', label: 'Expedia' },
    { color: 'bg-stone-200', label: 'Bloqueio' },
    { color: 'bg-amber-200', label: 'Manutenção' },
  ];
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-t border-stone-100 text-xs text-stone-600 flex-wrap">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className={cn('inline-block w-3 h-3 rounded', i.color)} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
