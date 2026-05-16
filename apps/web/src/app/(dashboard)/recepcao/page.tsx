'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Phone,
  IdCard,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

type Tab = 'checkins' | 'checkouts';

interface DayReservation {
  id: string;
  code: string;
  channel: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  guestPhone: string | null;
  guestDocument: string | null;
  rooms: string[];
}

interface DaySummary {
  date: string;
  checkIns: DayReservation[];
  checkOuts: DayReservation[];
}

const CHANNEL_COLOR: Record<string, string> = {
  direct: 'bg-emerald-100 text-emerald-700',
  airbnb: 'bg-rose-100 text-rose-700',
  booking: 'bg-blue-100 text-blue-700',
  expedia: 'bg-amber-100 text-amber-700',
  walk_in: 'bg-purple-100 text-purple-700',
  internal: 'bg-stone-100 text-stone-700',
};

export default function RecepcaoPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';
  const qc = useQueryClient();

  const [date, setDate] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('checkins');

  const dateStr = format(date, 'yyyy-MM-dd');

  const { data, isLoading } = useQuery({
    queryKey: ['day-summary', propertyId, dateStr],
    queryFn: () =>
      api<DaySummary>(
        `/dashboard/day?date=${dateStr}${propertyId ? `&propertyId=${propertyId}` : ''}`,
      ),
  });

  const checkIn = useMutation({
    mutationFn: (id: string) => api(`/reservations/${id}/check-in`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-summary'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => alert(`Erro: ${err.message}`),
  });

  const checkOut = useMutation({
    mutationFn: (id: string) => api(`/reservations/${id}/check-out`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-summary'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (err: Error) => alert(`Erro: ${err.message}`),
  });

  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const dateLabel = format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const list = tab === 'checkins' ? data?.checkIns ?? [] : data?.checkOuts ?? [];

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recepção</h1>
          <p className="text-stone-500 text-sm capitalize">
            {dateLabel} {isToday && '· Hoje'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(subDays(date, 1))}
            className="p-2 border border-stone-300 rounded-md hover:bg-stone-100"
            aria-label="Dia anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDate(new Date(e.target.value + 'T00:00:00'))}
            className="px-3 py-1.5 text-sm border border-stone-300 rounded-md"
          />
          <button
            onClick={() => setDate(new Date())}
            disabled={isToday}
            className="px-3 py-1.5 text-sm border border-stone-300 rounded-md hover:bg-stone-100 disabled:opacity-50"
          >
            Hoje
          </button>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-2 border border-stone-300 rounded-md hover:bg-stone-100"
            aria-label="Próximo dia"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-200">
        <TabButton
          active={tab === 'checkins'}
          onClick={() => setTab('checkins')}
          icon={LogIn}
          label="Check-ins"
          count={data?.checkIns.length ?? 0}
        />
        <TabButton
          active={tab === 'checkouts'}
          onClick={() => setTab('checkouts')}
          icon={LogOut}
          label="Check-outs"
          count={data?.checkOuts.length ?? 0}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-stone-500">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-400">
          {tab === 'checkins'
            ? 'Nenhuma chegada programada para esta data.'
            : 'Nenhuma saída programada para esta data.'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <ReservationRow
              key={r.id}
              r={r}
              tab={tab}
              onCheckIn={() => checkIn.mutate(r.id)}
              onCheckOut={() => checkOut.mutate(r.id)}
              processing={
                (checkIn.isPending && checkIn.variables === r.id) ||
                (checkOut.isPending && checkOut.variables === r.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof LogIn;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition',
        active
          ? 'border-stone-900 text-stone-900 font-semibold'
          : 'border-transparent text-stone-500 hover:text-stone-700',
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      <span
        className={cn(
          'ml-1 text-xs px-1.5 py-0.5 rounded-full',
          active ? 'bg-stone-900 text-white' : 'bg-stone-200 text-stone-600',
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ReservationRow({
  r,
  tab,
  onCheckIn,
  onCheckOut,
  processing,
}: {
  r: DayReservation;
  tab: Tab;
  onCheckIn: () => void;
  onCheckOut: () => void;
  processing: boolean;
}) {
  const canCheckIn = tab === 'checkins' && (r.status === 'pending' || r.status === 'confirmed');
  const canCheckOut = tab === 'checkouts' && r.status === 'checked_in';
  const alreadyCheckedIn = r.status === 'checked_in' && tab === 'checkins';
  const alreadyCheckedOut = r.status === 'checked_out' && tab === 'checkouts';

  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4 flex items-center gap-4">
      {/* Indicador de status */}
      <div className="flex-shrink-0">
        {alreadyCheckedIn || alreadyCheckedOut ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        ) : (
          <div className="w-8 h-8 rounded-full border-2 border-stone-300" />
        )}
      </div>

      {/* Dados do hóspede + reserva */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold">{r.guestName}</span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold',
              CHANNEL_COLOR[r.channel] ?? 'bg-stone-100 text-stone-700',
            )}
          >
            {r.channel}
          </span>
          <span className="text-xs font-mono text-stone-400">{r.code}</span>
        </div>
        <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-3 flex-wrap">
          <span className="font-medium">Quarto {r.rooms.join(', ')}</span>
          <span>{r.nights} noite{r.nights > 1 ? 's' : ''}</span>
          <span>
            {format(new Date(r.checkIn), 'dd/MM')} → {format(new Date(r.checkOut), 'dd/MM')}
          </span>
        </div>
        {(r.guestPhone || r.guestDocument) && (
          <div className="text-xs text-stone-500 mt-1 flex items-center gap-3 flex-wrap">
            {r.guestPhone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {r.guestPhone}
              </span>
            )}
            {r.guestDocument && (
              <span className="flex items-center gap-1">
                <IdCard className="w-3 h-3" />
                {r.guestDocument}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Ação */}
      <div className="flex-shrink-0">
        {canCheckIn && (
          <button
            onClick={onCheckIn}
            disabled={processing}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <LogIn className="w-4 h-4" />
            {processing ? 'Processando…' : 'Fazer check-in'}
          </button>
        )}
        {canCheckOut && (
          <button
            onClick={onCheckOut}
            disabled={processing}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <LogOut className="w-4 h-4" />
            {processing ? 'Processando…' : 'Fazer check-out'}
          </button>
        )}
        {alreadyCheckedIn && (
          <span className="text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-md">
            ✓ Check-in feito
          </span>
        )}
        {alreadyCheckedOut && (
          <span className="text-xs text-stone-600 bg-stone-100 px-3 py-1.5 rounded-md">
            ✓ Check-out feito
          </span>
        )}
      </div>
    </div>
  );
}
