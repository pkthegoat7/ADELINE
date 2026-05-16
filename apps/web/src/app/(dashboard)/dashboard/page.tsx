'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BedDouble,
  CalendarCheck,
  DollarSign,
  LogOut,
  Plug,
  ArrowRight,
  ListChecks,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

interface ReservationSummary {
  id: string;
  code: string;
  channel: string;
  status: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guestName: string;
  rooms: string[];
  totalAmount: string;
}

interface DashboardSummary {
  occupancy: { occupied: number; total: number; percent: number };
  todayCheckIns: ReservationSummary[];
  todayCheckOuts: ReservationSummary[];
  upcomingArrivals: ReservationSummary[];
  monthRevenue: { value: number; reservationCount: number };
  channels: Array<{
    id: string;
    channel: string;
    status: string;
    lastSyncAt: string | null;
    errorCount: number;
    syncError: string | null;
  }>;
}

const CHANNEL_COLOR: Record<string, string> = {
  direct: 'bg-emerald-100 text-emerald-700',
  airbnb: 'bg-rose-100 text-rose-700',
  booking: 'bg-blue-100 text-blue-700',
  expedia: 'bg-amber-100 text-amber-700',
  walk_in: 'bg-purple-100 text-purple-700',
  internal: 'bg-stone-100 text-stone-700',
};

export default function DashboardPage() {
  const propertyId = process.env.NEXT_PUBLIC_DEMO_PROPERTY_ID ?? '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', propertyId],
    queryFn: () =>
      api<DashboardSummary>(
        `/dashboard/summary${propertyId ? `?propertyId=${propertyId}` : ''}`,
      ),
    refetchInterval: 60_000, // atualiza a cada 60s
  });

  const todayLabel = format(new Date(), "'Hoje,' EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Visão geral</h1>
        <p className="text-stone-500 text-sm capitalize">{todayLabel}</p>
      </header>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3">
          Erro ao carregar resumo: {(error as Error).message}
        </div>
      )}

      {/* Cards de métricas */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Ocupação hoje"
          value={isLoading ? '…' : `${data?.occupancy.percent ?? 0}%`}
          sub={
            isLoading
              ? ''
              : `${data?.occupancy.occupied ?? 0} de ${data?.occupancy.total ?? 0} quartos`
          }
          icon={BedDouble}
        />
        <MetricCard
          label="Chegadas hoje"
          value={isLoading ? '…' : String(data?.todayCheckIns.length ?? 0)}
          sub={`${data?.todayCheckOuts.length ?? 0} saídas`}
          icon={CalendarCheck}
        />
        <MetricCard
          label="Receita do mês"
          value={
            isLoading
              ? '…'
              : (data?.monthRevenue.value ?? 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  maximumFractionDigits: 0,
                })
          }
          sub={`${data?.monthRevenue.reservationCount ?? 0} reservas`}
          icon={DollarSign}
        />
        <MetricCard
          label="Próximas chegadas"
          value={isLoading ? '…' : String(data?.upcomingArrivals.length ?? 0)}
          sub="próximos 7 dias"
          icon={ListChecks}
        />
      </section>

      {/* Listas: hoje */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReservationList
          title="Chegadas hoje"
          icon={CalendarCheck}
          empty="Nenhuma chegada programada."
          reservations={data?.todayCheckIns}
          loading={isLoading}
          showNights
        />
        <ReservationList
          title="Saídas hoje"
          icon={LogOut}
          empty="Nenhuma saída programada."
          reservations={data?.todayCheckOuts}
          loading={isLoading}
          showCheckOut
        />
      </section>

      {/* Próximas chegadas + canais */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ReservationList
            title="Próximas chegadas (7 dias)"
            icon={ListChecks}
            empty="Nenhuma chegada nos próximos 7 dias."
            reservations={data?.upcomingArrivals}
            loading={isLoading}
            showDate
            showNights
          />
        </div>
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Plug className="w-4 h-4 text-stone-500" />
              Canais
            </h2>
            <Link
              href="/channels"
              className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-0.5"
            >
              gerenciar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {isLoading ? (
            <div className="text-sm text-stone-400">Carregando…</div>
          ) : data?.channels.length === 0 ? (
            <div className="text-sm text-stone-400 italic">
              Nenhum canal conectado.{' '}
              <Link href="/channels" className="underline hover:text-stone-700">
                Conectar
              </Link>
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {data?.channels.map((c) => (
                <li key={c.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 capitalize">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full',
                        c.status === 'active' ? 'bg-emerald-500' : 'bg-red-500',
                      )}
                    />
                    {c.channel}
                  </span>
                  <span className="text-xs text-stone-500">
                    {c.lastSyncAt
                      ? format(new Date(c.lastSyncAt), "dd/MM HH:mm")
                      : 'nunca sincronizou'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );

  function MetricCard({
    label,
    value,
    sub,
    icon: Icon,
  }: {
    label: string;
    value: string;
    sub: string;
    icon: typeof BedDouble;
  }) {
    return (
      <div className="bg-white rounded-lg border border-stone-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-stone-500">{label}</span>
          <Icon className="w-4 h-4 text-stone-400" />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-stone-500 mt-1">{sub}</div>
      </div>
    );
  }

  function ReservationList({
    title,
    icon: Icon,
    reservations,
    empty,
    loading,
    showNights,
    showCheckOut,
    showDate,
  }: {
    title: string;
    icon: typeof CalendarCheck;
    reservations?: ReservationSummary[];
    empty: string;
    loading: boolean;
    showNights?: boolean;
    showCheckOut?: boolean;
    showDate?: boolean;
  }) {
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Icon className="w-4 h-4 text-stone-500" />
            {title}
          </h2>
          <Link
            href="/reservations"
            className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-0.5"
          >
            ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {loading ? (
          <div className="text-sm text-stone-400">Carregando…</div>
        ) : reservations?.length === 0 ? (
          <div className="text-sm text-stone-400 italic">{empty}</div>
        ) : (
          <ul className="text-sm divide-y divide-stone-100">
            {reservations?.map((r) => (
              <li key={r.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.guestName}</span>
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold',
                        CHANNEL_COLOR[r.channel] ?? 'bg-stone-100 text-stone-700',
                      )}
                    >
                      {r.channel}
                    </span>
                  </div>
                  <div className="text-xs text-stone-500 truncate">
                    {r.rooms.join(', ')} · {r.code}
                  </div>
                </div>
                <div className="text-xs text-stone-500 text-right whitespace-nowrap">
                  {showDate && format(new Date(r.checkIn), 'dd/MM')}
                  {showNights && (showDate ? ' · ' : '') + `${r.nights} noite${r.nights > 1 ? 's' : ''}`}
                  {showCheckOut && format(new Date(r.checkOut), 'dd/MM')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
}
