'use client';

import { useQuery } from '@tanstack/react-query';
import { addDays, format, isSameDay, isWeekend } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useUI } from '@/lib/ui-store';

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

const CHANNEL_GRADIENT: Record<string, string> = {
  direct: 'from-emerald-500 to-emerald-600',
  internal: 'from-sand-500 to-sand-600',
  airbnb: 'from-rose-500 to-rose-600',
  booking: 'from-blue-500 to-blue-600',
  expedia: 'from-amber-500 to-amber-600',
  walk_in: 'from-purple-500 to-purple-600',
};

const CHANNEL_DOT: Record<string, string> = {
  direct: 'bg-emerald-500',
  internal: 'bg-sand-500',
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
  onCellClick,
}: {
  from: string;
  to: string;
  days: number;
  startDate: Date;
  onCellClick?: (roomId: string, date: Date) => void;
}) {
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
      <div className="surface-card border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/20 text-brand-900 dark:text-brand-200 p-4 text-sm rounded-xl">
        Defina <code className="font-mono px-1.5 py-0.5 bg-brand-100 dark:bg-brand-900/40 rounded">NEXT_PUBLIC_DEMO_PROPERTY_ID</code> no <code className="font-mono px-1.5 py-0.5 bg-brand-100 dark:bg-brand-900/40 rounded">.env.local</code> para visualizar o calendário.
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="surface-card p-8">
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 skeleton rounded-lg" />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <div className="text-red-600">Erro ao carregar calendário.</div>;
  if (!data) return null;

  const colWidth = days === 30 ? 64 : days === 14 ? 88 : 130;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="surface-card overflow-x-auto scrollbar-thin shadow-soft"
    >
      <div style={{ minWidth: 240 + days * colWidth }}>
        {/* Header */}
        <div
          className="grid sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur-md border-b border-line"
          style={{ gridTemplateColumns: `240px repeat(${days}, ${colWidth}px)` }}
        >
          <div className="p-4 text-[10px] font-semibold text-ink-muted uppercase tracking-[0.18em] border-r border-line">
            Quarto
          </div>
          {dateColumns.map((d) => {
            const today = isSameDay(d, new Date());
            const weekend = isWeekend(d);
            return (
              <div
                key={d.toISOString()}
                className={cn(
                  'p-2 text-center text-xs border-r border-line-soft transition-colors',
                  weekend && 'bg-surface-sunken/50',
                  today && 'bg-gradient-to-b from-brand-100/80 to-transparent dark:from-brand-900/40',
                )}
              >
                <div
                  className={cn(
                    'font-serif text-base num-tabular leading-none',
                    today ? 'text-brand-700 dark:text-brand-300 font-semibold' : 'text-ink',
                  )}
                >
                  {format(d, 'dd')}
                </div>
                <div
                  className={cn(
                    'text-[9px] uppercase tracking-wider mt-1',
                    today ? 'text-brand-600 dark:text-brand-400 font-semibold' : 'text-ink-muted',
                  )}
                >
                  {format(d, 'EEE', { locale: ptBR })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Linhas */}
        {data.rooms.map((room, idx) => (
          <motion.div
            key={room.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03, duration: 0.3 }}
            className="grid border-b border-line-soft hover:bg-surface-sunken/30 transition-colors group"
            style={{ gridTemplateColumns: `240px repeat(${days}, ${colWidth}px)` }}
          >
            <div className="p-3 border-r border-line-soft flex items-center gap-3 bg-surface-elevated/40">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sand-100 to-sand-200 dark:from-sand-800 dark:to-sand-900 flex items-center justify-center font-serif text-sm font-semibold text-ink-soft flex-shrink-0">
                {room.code.slice(-2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-ink truncate">Quarto {room.code}</div>
                <div className="text-[11px] text-ink-muted truncate">{room.roomType.name}</div>
                <div className="mt-1">
                  <RoomStatusBadge status={room.status} />
                </div>
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
                  onEmptyClick={onCellClick ? () => onCellClick(room.id, d) : undefined}
                />
              );
            })}
          </motion.div>
        ))}
        {data.rooms.length === 0 && (
          <div className="p-12 text-center text-ink-muted">
            <div className="text-3xl mb-2 opacity-30">◆</div>
            Nenhum quarto cadastrado.
          </div>
        )}
      </div>
      <Legend />
    </motion.div>
  );
}

function CellView({
  date,
  cell,
  isWeekendDay,
  isToday,
  onEmptyClick,
}: {
  date: Date;
  cell: CalendarCell | undefined;
  isWeekendDay: boolean;
  isToday: boolean;
  onEmptyClick?: () => void;
}) {
  const status = cell?.status ?? 'available';
  const r = cell?.reservation;

  if (status === 'reserved' && r) {
    const gradient = CHANNEL_GRADIENT[r.channel] ?? 'from-sand-500 to-sand-600';
    return <ReservationCell r={r} gradient={gradient} />;
  }

  if (status === 'blocked' || status === 'maintenance') {
    return (
      <div className="p-1 border-r border-line-soft">
        <div
          className={cn(
            'rounded-md text-[10px] px-2 py-1.5 font-medium cursor-pointer text-center transition-transform hover:scale-[1.04]',
            status === 'maintenance'
              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700'
              : 'bg-sand-200 dark:bg-sand-800 text-sand-700 dark:text-sand-300 border border-sand-300 dark:border-sand-700',
          )}
          title={status === 'maintenance' ? 'Manutenção' : 'Bloqueado'}
        >
          {status === 'maintenance' ? '🔧' : '⛔'}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onEmptyClick}
      className={cn(
        'border-r border-line-soft cursor-pointer transition-all relative group/cell w-full h-full',
        'hover:bg-brand-100/40 dark:hover:bg-brand-900/20',
        isWeekendDay && 'bg-surface-sunken/40',
        isToday && 'bg-brand-50/40 dark:bg-brand-950/30',
      )}
      title={`Criar reserva • ${format(date, 'dd/MM')}`}
    >
      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none">
        <span className="text-brand-500/60 text-lg">+</span>
      </span>
    </button>
  );
}

function ReservationCell({
  r,
  gradient,
}: {
  r: NonNullable<CalendarCell['reservation']>;
  gradient: string;
}) {
  const openReservation = useUI((s) => s.openReservation);
  return (
    <div className="p-1 border-r border-line-soft">
      <button
        onClick={() => openReservation(r.id)}
        className={cn(
          'rounded-md px-2 py-1.5 text-white text-[10.5px] leading-tight cursor-pointer transition-all text-left w-full h-full',
          'bg-gradient-to-br',
          gradient,
          'hover:shadow-md hover:scale-[1.04] hover:-translate-y-0.5 active:scale-100',
          'shadow-sm shadow-black/10',
        )}
        title={`${r.code} • ${r.guest.fullName} • ${r.channel} — clique para detalhes`}
      >
        <div className="font-semibold truncate leading-tight">{r.guest.fullName}</div>
        <div className="opacity-80 text-[9px] font-mono mt-0.5 truncate">{r.code}</div>
      </button>
    </div>
  );
}

function RoomStatusBadge({ status }: { status: string }) {
  const palette: Record<string, string> = {
    clean: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    dirty: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    inspected: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    out_of_order: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  };
  const labels: Record<string, string> = {
    clean: 'Limpo',
    dirty: 'Sujo',
    inspected: 'Inspec.',
    maintenance: 'Manut.',
    out_of_order: 'Fora',
  };
  return (
    <span className={cn('inline-block text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider', palette[status] ?? 'bg-sand-200 text-sand-700')}>
      {labels[status] ?? status}
    </span>
  );
}

function Legend() {
  const items: Array<{ dot: string; label: string }> = [
    { dot: CHANNEL_DOT.direct, label: 'Direta' },
    { dot: CHANNEL_DOT.airbnb, label: 'Airbnb' },
    { dot: CHANNEL_DOT.booking, label: 'Booking' },
    { dot: CHANNEL_DOT.expedia, label: 'Expedia' },
    { dot: CHANNEL_DOT.walk_in, label: 'Walk-in' },
    { dot: 'bg-sand-300', label: 'Bloqueio' },
    { dot: 'bg-amber-300', label: 'Manutenção' },
  ];
  return (
    <div className="flex items-center gap-4 px-5 py-3 border-t border-line-soft text-[11px] text-ink-muted flex-wrap bg-surface-sunken/30">
      <span className="uppercase tracking-[0.16em] font-semibold text-[10px]">Legenda</span>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className={cn('inline-block w-2.5 h-2.5 rounded-full', i.dot)} />
          {i.label}
        </div>
      ))}
    </div>
  );
}
