'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  Phone,
  IdCard,
  CheckCircle2,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { Spinner } from '@/components/ui/Spinner';
import { useUI } from '@/lib/ui-store';

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
  direct: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  airbnb: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  booking: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  expedia: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  walk_in: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  internal: 'bg-sand-200 text-sand-800 dark:bg-sand-800/40 dark:text-sand-300',
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
      toast.success('Check-in registrado');
    },
    onError: (err: Error) => toast.error('Erro no check-in', err.message),
  });

  const checkOut = useMutation({
    mutationFn: (id: string) => api(`/reservations/${id}/check-out`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['day-summary'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['rooms'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Check-out registrado', 'Quarto marcado como sujo pra housekeeping.');
    },
    onError: (err: Error) => toast.error('Erro no check-out', err.message),
  });

  const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  const dateLabel = format(date, "EEEE, dd 'de' MMMM", { locale: ptBR });

  const list = tab === 'checkins' ? data?.checkIns ?? [] : data?.checkOuts ?? [];

  // Contadores resumidos
  const totalCheckins = data?.checkIns.length ?? 0;
  const totalCheckouts = data?.checkOuts.length ?? 0;
  const pendingCheckins = data?.checkIns.filter((r) => r.status !== 'checked_in' && r.status !== 'cancelled').length ?? 0;
  const pendingCheckouts = data?.checkOuts.filter((r) => r.status === 'checked_in').length ?? 0;

  return (
    <div className="p-6 lg:p-8 space-y-5 max-w-[1400px]">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-ink-muted mb-1">
            <span className="ornament">◆</span>
            <span>{isToday ? 'Hoje' : 'Operação'}</span>
          </div>
          <h2 className="font-serif text-3xl tracking-serif text-ink capitalize">{dateLabel}</h2>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface-elevated p-0.5">
          <button
            onClick={() => setDate(subDays(date, 1))}
            className="p-1.5 rounded-md hover:bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
            aria-label="Dia anterior"
            data-tip="Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDate(new Date(e.target.value + 'T00:00:00'))}
            className="bg-transparent px-2 py-1.5 text-sm text-ink num-tabular outline-none cursor-pointer"
          />
          <button
            onClick={() => setDate(new Date())}
            disabled={isToday}
            className="px-3 py-1.5 text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-sunken rounded-md transition-colors flex items-center gap-1.5 disabled:opacity-40"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Hoje
          </button>
          <button
            onClick={() => setDate(addDays(date, 1))}
            className="p-1.5 rounded-md hover:bg-surface-sunken text-ink-soft hover:text-ink transition-colors"
            aria-label="Próximo dia"
            data-tip="Próximo"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Resumo do dia em cards */}
      <section className="grid grid-cols-2 gap-3 stagger">
        <SummaryStat
          label="Chegadas"
          total={totalCheckins}
          pending={pendingCheckins}
          icon={LogIn}
          tone="emerald"
        />
        <SummaryStat
          label="Saídas"
          total={totalCheckouts}
          pending={pendingCheckouts}
          icon={LogOut}
          tone="sky"
        />
      </section>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        <TabButton
          active={tab === 'checkins'}
          onClick={() => setTab('checkins')}
          icon={LogIn}
          label="Chegadas"
          count={totalCheckins}
        />
        <TabButton
          active={tab === 'checkouts'}
          onClick={() => setTab('checkouts')}
          icon={LogOut}
          label="Saídas"
          count={totalCheckouts}
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-card p-10 text-center"
        >
          <div className="text-4xl mb-3 opacity-30">◆</div>
          <p className="text-ink-muted">
            {tab === 'checkins'
              ? 'Nenhuma chegada programada para esta data.'
              : 'Nenhuma saída programada para esta data.'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2.5 stagger">
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

function SummaryStat({
  label,
  total,
  pending,
  icon: Icon,
  tone,
}: {
  label: string;
  total: number;
  pending: number;
  icon: LucideIcon;
  tone: 'emerald' | 'sky';
}) {
  const colors =
    tone === 'emerald'
      ? {
          icon: 'from-emerald-400 to-emerald-600 shadow-emerald-500/30',
          accent: 'text-emerald-700 dark:text-emerald-300',
          bg: 'bg-emerald-50/40 dark:bg-emerald-900/10',
        }
      : {
          icon: 'from-sky-400 to-sky-600 shadow-sky-500/30',
          accent: 'text-sky-700 dark:text-sky-300',
          bg: 'bg-sky-50/40 dark:bg-sky-900/10',
        };
  return (
    <div className={cn('surface-card p-4 flex items-center gap-4', colors.bg)}>
      <div
        className={cn(
          'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-md',
          colors.icon,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-muted font-semibold">
          {label}
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="font-serif text-2xl tracking-serif text-ink num-tabular">{total}</span>
          {pending > 0 && (
            <span className={cn('text-xs font-medium', colors.accent)}>{pending} pendentes</span>
          )}
        </div>
      </div>
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
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-2 px-4 py-2.5 text-sm -mb-px transition-colors',
        active ? 'text-ink font-semibold' : 'text-ink-muted hover:text-ink-soft',
      )}
    >
      {active && (
        <motion.span
          layoutId="recepcao-tab"
          className="absolute -bottom-px left-0 right-0 h-[2px] bg-gradient-to-r from-brand-500 to-gold-500 rounded-full"
        />
      )}
      <Icon className={cn('w-4 h-4', active && 'text-brand-600')} />
      {label}
      <span
        className={cn(
          'ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
          active ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-300' : 'bg-surface-sunken text-ink-muted',
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
  const openReservation = useUI((s) => s.openReservation);
  const canCheckIn = tab === 'checkins' && (r.status === 'pending' || r.status === 'confirmed');
  const canCheckOut = tab === 'checkouts' && r.status === 'checked_in';
  const alreadyCheckedIn = r.status === 'checked_in' && tab === 'checkins';
  const alreadyCheckedOut = r.status === 'checked_out' && tab === 'checkouts';
  const done = alreadyCheckedIn || alreadyCheckedOut;

  return (
    <div
      onClick={() => openReservation(r.id)}
      className={cn(
        'relative surface-card p-4 flex items-center gap-4 card-hover cursor-pointer overflow-hidden',
        done && 'opacity-75',
      )}
    >
      {/* Indicador lateral */}
      <span
        className={cn(
          'absolute left-0 top-3 bottom-3 w-1 rounded-r-full',
          done
            ? 'bg-gradient-to-b from-emerald-400 to-emerald-600'
            : 'bg-gradient-to-b from-brand-400 to-gold-500',
        )}
      />

      {/* Status icon */}
      <div className="flex-shrink-0 pl-1">
        {done ? (
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-full border-2 border-dashed border-ink-muted/40 flex items-center justify-center">
            <span className="text-ink-muted/60 text-xs font-serif font-bold">{tab === 'checkins' ? 'IN' : 'OUT'}</span>
          </div>
        )}
      </div>

      {/* Dados */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-serif text-base font-semibold text-ink tracking-serif">{r.guestName}</span>
          <span
            className={cn(
              'text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold tracking-wider',
              CHANNEL_COLOR[r.channel] ?? 'bg-sand-200 text-sand-800',
            )}
          >
            {r.channel}
          </span>
          <span className="text-[11px] font-mono text-ink-muted">{r.code}</span>
        </div>
        <div className="text-xs text-ink-muted mt-1 flex items-center gap-3 flex-wrap num-tabular">
          <span className="font-medium text-ink-soft">Quarto {r.rooms.join(', ')}</span>
          <span>·</span>
          <span>
            {r.nights} noite{r.nights > 1 ? 's' : ''}
          </span>
          <span>·</span>
          <span>
            {format(new Date(r.checkIn), 'dd/MM')} → {format(new Date(r.checkOut), 'dd/MM')}
          </span>
        </div>
        {(r.guestPhone || r.guestDocument) && (
          <div className="text-xs text-ink-muted mt-1.5 flex items-center gap-3 flex-wrap">
            {r.guestPhone && (
              <span className="flex items-center gap-1.5 hover:text-ink-soft transition-colors">
                <Phone className="w-3 h-3" />
                {r.guestPhone}
              </span>
            )}
            {r.guestDocument && (
              <span className="flex items-center gap-1.5">
                <IdCard className="w-3 h-3" />
                {r.guestDocument}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Ação */}
      <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        {canCheckIn && (
          <button
            onClick={onCheckIn}
            disabled={processing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-b from-emerald-500 to-emerald-600 text-white rounded-lg hover:from-emerald-600 hover:to-emerald-700 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 transition-all font-medium"
          >
            {processing ? <Spinner size={14} /> : <LogIn className="w-4 h-4" />}
            {processing ? 'Processando…' : 'Check-in'}
          </button>
        )}
        {canCheckOut && (
          <button
            onClick={onCheckOut}
            disabled={processing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gradient-to-b from-sky-500 to-sky-600 text-white rounded-lg hover:from-sky-600 hover:to-sky-700 shadow-md shadow-sky-500/20 hover:shadow-sky-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0 transition-all font-medium"
          >
            {processing ? <Spinner size={14} /> : <LogOut className="w-4 h-4" />}
            {processing ? 'Processando…' : 'Check-out'}
          </button>
        )}
        {alreadyCheckedIn && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/40 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Hospedado
          </span>
        )}
        {alreadyCheckedOut && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-soft bg-surface-sunken px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Finalizado
          </span>
        )}
      </div>
    </div>
  );
}
